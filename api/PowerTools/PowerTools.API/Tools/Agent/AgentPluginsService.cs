using Microsoft.Crm.Sdk.Messages;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Gateway;
using PowerTools.API.Tools.PluginRegistration.Inspection;
using PowerTools.API.Tools.PluginRegistration.Services;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.Agent;

// ── Requests ─────────────────────────────────────────────────────────────────

public sealed class RegisterAssemblyBody
{
    public string? FileName { get; set; }
    public string? ContentBase64 { get; set; }
    public string? Solution { get; set; }
}

public sealed class UpdateAssemblyBody
{
    public string? FileName { get; set; }
    public string? ContentBase64 { get; set; }
}

/// <summary>The fields of <see cref="StepDraftDto"/>, plus the solution to add a new step to.</summary>
public sealed class StepBody
{
    public string? Name { get; set; }
    public Guid PluginTypeId { get; set; }
    public Guid MessageId { get; set; }
    public Guid? FilterId { get; set; }
    public int Stage { get; set; }
    public int Mode { get; set; }
    public int Rank { get; set; } = 1;
    public int SupportedDeployment { get; set; }
    public bool AsyncAutoDelete { get; set; }
    public List<string>? FilteringAttributes { get; set; }
    public Guid? ImpersonatingUserId { get; set; }
    public string? Description { get; set; }
    public string? Configuration { get; set; }
    public string? SecureConfigurationAction { get; set; }
    public string? SecureConfiguration { get; set; }
    public string? Solution { get; set; }

    public StepDraftDto ToDraft() => new(
        Name ?? "", PluginTypeId, MessageId, FilterId, Stage, Mode, Rank, SupportedDeployment, AsyncAutoDelete,
        FilteringAttributes ?? [], ImpersonatingUserId, Description, Configuration, SecureConfigurationAction ?? "keep", SecureConfiguration);
}

public sealed class StepStateBody
{
    public bool? Enabled { get; set; }
}

public sealed class ImageBody
{
    public Guid StepId { get; set; }
    public string? Name { get; set; }
    public string? EntityAlias { get; set; }
    public int ImageType { get; set; }
    public List<string>? Attributes { get; set; }

    public ImageDraftDto ToDraft() => new(StepId, Name ?? "", EntityAlias ?? "", ImageType, Attributes ?? []);
}

public sealed class UnregisterBody
{
    /// <summary>assembly, type, step or image.</summary>
    public string? Kind { get; set; }
    public Guid Id { get; set; }
}

/// <summary>Plug-in registration for the agent tools. It runs the existing registration services unchanged.</summary>
public sealed class AgentPluginsService(IAgentClient client, IPluginAssemblyInspector inspector, bool isOnline)
{
    public const long MaxAssemblyBytes = 16 * 1024 * 1024;

    private IPluginRegistrationGateway Gateway => new AgentPluginGateway(client);

    // ── Reads ────────────────────────────────────────────────────────────────

    /// <summary>The catalog, narrowed by assembly name, table or message when given.</summary>
    public Task<AgentResult<CatalogDto>> CatalogAsync(string? assembly, string? table, string? message, CancellationToken ct) =>
        Guard(async () =>
        {
            var all = await new CatalogService(Gateway).GetAsync(ct);
            var assemblies = all.Assemblies
                .Where(a => string.IsNullOrWhiteSpace(assembly) || a.Name.Contains(assembly.Trim(), StringComparison.OrdinalIgnoreCase))
                .ToList();
            var assemblyIds = assemblies.Select(a => a.Id).ToHashSet();
            var types = all.Types.Where(t => assemblyIds.Contains(t.AssemblyId)).ToList();
            var typeIds = types.Select(t => t.Id).ToHashSet();
            var steps = all.Steps
                .Where(s => typeIds.Contains(s.PluginTypeId))
                .Where(s => string.IsNullOrWhiteSpace(table) || string.Equals(s.PrimaryEntity, table.Trim(), StringComparison.OrdinalIgnoreCase))
                .Where(s => string.IsNullOrWhiteSpace(message) || string.Equals(s.MessageName, message.Trim(), StringComparison.OrdinalIgnoreCase))
                .ToList();

            if (!string.IsNullOrWhiteSpace(table) || !string.IsNullOrWhiteSpace(message))
            {
                // Only what the matching steps belong to.
                var usedTypes = steps.Select(s => s.PluginTypeId).ToHashSet();
                types = types.Where(t => usedTypes.Contains(t.Id)).ToList();
                var usedAssemblies = types.Select(t => t.AssemblyId).ToHashSet();
                assemblies = assemblies.Where(a => usedAssemblies.Contains(a.Id)).ToList();
            }

            var stepIds = steps.Select(s => s.Id).ToHashSet();
            var images = all.Images.Where(i => stepIds.Contains(i.StepId)).ToList();
            return AgentResult<CatalogDto>.Ok(new CatalogDto(assemblies, types, steps, images));
        });

    public Task<AgentResult<StepOptionsDto>> StepOptionsAsync(CancellationToken ct) =>
        Guard(async () => AgentResult<StepOptionsDto>.Ok(await new StepOptionsService(Gateway).GetAsync(ct)));

    // ── Assemblies ───────────────────────────────────────────────────────────

    public Task<AgentResult<MutationResultDto>> RegisterAssemblyAsync(RegisterAssemblyBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            var (name, bytes) = Decode(body.FileName, body.ContentBase64);
            var capabilities = CapabilitiesService.For(isOnline);
            await using var stream = new MemoryStream(bytes);
            var result = await new AssemblyService(Gateway, inspector).RegisterAsync(
                stream,
                name,
                bytes.Length,
                new AssemblyRegisterRequest(RegistrationOptionValues.IsolationSandbox, RegistrationOptionValues.SourceDatabase),
                capabilities,
                ct);
            await AddToSolutionAsync(body.Solution, result.Id, RegistrationOptionValues.ComponentTypePluginAssembly, ct);
            return AgentResult<MutationResultDto>.Ok(result);
        });

    public Task<AgentResult<MutationResultDto>> UpdateAssemblyAsync(Guid id, UpdateAssemblyBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            var (name, bytes) = Decode(body.FileName, body.ContentBase64);
            await using var stream = new MemoryStream(bytes);
            return AgentResult<MutationResultDto>.Ok(
                await new AssemblyService(Gateway, inspector).UpdateAsync(id, stream, name, bytes.Length, ct));
        });

    // ── Steps and images ─────────────────────────────────────────────────────

    public Task<AgentResult<MutationResultDto>> CreateStepAsync(StepBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            var result = await new StepService(Gateway).CreateAsync(body.ToDraft(), ct);
            await AddToSolutionAsync(body.Solution, result.Id, RegistrationOptionValues.ComponentTypeSdkMessageProcessingStep, ct);
            return AgentResult<MutationResultDto>.Ok(result);
        });

    public Task<AgentResult<MutationResultDto>> UpdateStepAsync(Guid id, StepBody body, CancellationToken ct) =>
        Guard(async () => AgentResult<MutationResultDto>.Ok(await new StepService(Gateway).UpdateAsync(id, body.ToDraft(), ct)));

    public Task<AgentResult<MutationResultDto>> SetStepStateAsync(Guid id, StepStateBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            if (body.Enabled is not bool enabled) throw Invalid("enabled is required.");
            return AgentResult<MutationResultDto>.Ok(await new StepService(Gateway).SetEnabledAsync(id, enabled, ct));
        });

    public Task<AgentResult<MutationResultDto>> CreateImageAsync(ImageBody body, CancellationToken ct) =>
        Guard(async () => AgentResult<MutationResultDto>.Ok(await new ImageService(Gateway).CreateAsync(body.ToDraft(), ct)));

    public Task<AgentResult<MutationResultDto>> UpdateImageAsync(Guid id, ImageBody body, CancellationToken ct) =>
        Guard(async () => AgentResult<MutationResultDto>.Ok(await new ImageService(Gateway).UpdateAsync(id, body.ToDraft(), ct)));

    public Task<AgentResult<MutationResultDto>> UnregisterAsync(UnregisterBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            var service = new UnregisterService(Gateway);
            var result = body.Kind?.ToLowerInvariant() switch
            {
                "assembly" => await service.UnregisterAssemblyAsync(body.Id, ct),
                "type" => await service.UnregisterTypeAsync(body.Id, ct),
                "step" => await service.UnregisterStepAsync(body.Id, ct),
                "image" => await service.UnregisterImageAsync(body.Id, ct),
                _ => throw Invalid("kind must be assembly, type, step or image."),
            };
            return AgentResult<MutationResultDto>.Ok(result);
        });

    // ── Helpers ──────────────────────────────────────────────────────────────

    /// <summary>Decodes the assembly. The same size limit applies as to the file the main process read.</summary>
    internal static (string FileName, byte[] Bytes) Decode(string? fileName, string? contentBase64)
    {
        if (string.IsNullOrWhiteSpace(fileName)) throw Invalid("fileName is required.");
        if (string.IsNullOrWhiteSpace(contentBase64)) throw Invalid("contentBase64 is required.");
        // Four base64 characters hold three bytes, so a too-large body is refused before it is decoded.
        if (contentBase64.Length / 4L * 3 > MaxAssemblyBytes + 3) throw Invalid("The assembly is larger than 16 MB.");
        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(contentBase64);
        }
        catch (FormatException)
        {
            throw Invalid("contentBase64 is not valid base64.");
        }

        if (bytes.Length == 0 || bytes.Length > MaxAssemblyBytes) throw Invalid("The assembly must be from 1 byte to 16 MB.");
        return (Path.GetFileName(fileName), bytes);
    }

    private async Task AddToSolutionAsync(string? solution, Guid componentId, int componentType, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(solution)) return;
        await client.ExecuteAsync(
            new AddSolutionComponentRequest
            {
                ComponentId = componentId,
                ComponentType = componentType,
                SolutionUniqueName = solution.Trim(),
                AddRequiredComponents = false,
            },
            ct);
    }

    private static async Task<AgentResult<T>> Guard<T>(Func<Task<AgentResult<T>>> work)
    {
        try
        {
            return await work();
        }
        catch (RegistrationException ex)
        {
            return AgentResult<T>.Fail(FromRegistration(ex));
        }
        catch (AssemblyInspectionValidationException ex)
        {
            return AgentResult<T>.Fail(AgentFaults.InvalidRequest(ex.Message));
        }
        catch (Exception ex)
        {
            return AgentResult<T>.Fail(AgentFaults.From(ex));
        }
    }

    private static AgentProblem FromRegistration(RegistrationException ex)
    {
        var details = string.Join("; ", ex.Problem.Problems.Select(p => $"{p.Field}: {p.Message}"));
        var message = details.Length > 0 ? $"{ex.Problem.Message} {details}" : ex.Problem.Message;
        return ex.StatusCode == StatusCodes.Status404NotFound
            ? AgentFaults.NotFound(message)
            : AgentFaults.InvalidRequest(message);
    }

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
