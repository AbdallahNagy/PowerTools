using System.ComponentModel;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json.Serialization;
using System.Xml.Linq;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Components.Shared;
using PowerTools.API.Tools.Agent.Kernel;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Inspection;
using PowerTools.API.Tools.PluginRegistration.Queries;
using PowerTools.API.Tools.PluginRegistration.Services;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.Agent.Components.Plugins;

[JsonConverter(typeof(JsonStringEnumConverter<IsolationMode>))]
public enum IsolationMode
{
    [JsonStringEnumMemberName("sandbox")] Sandbox,
    [JsonStringEnumMemberName("none")] None,
}

[Description("Deploys a plug-in assembly (.dll) or, online, a NuGet plug-in package (.nupkg) from this computer.")]
public sealed class PluginDeploySpec : IApplySpec
{
    [Description("Unique name of the unmanaged solution the assembly or package goes into.")]
    public required string Solution { get; init; }

    [Description("Absolute path of the .dll or .nupkg.")]
    public required string Path { get; init; }

    [Description("Default sandbox. none is allowed on-premises only.")]
    public IsolationMode? IsolationMode { get; init; }
}

/// <summary>Turns plug-in registration errors into agent problems, so a failed step reports them.</summary>
internal static class PluginErrors
{
    public static async Task Run(Func<Task> work)
    {
        try
        {
            await work();
        }
        catch (RegistrationException ex)
        {
            var details = string.Join("; ", ex.Problem.Problems.Select(p => $"{p.Field}: {p.Message}"));
            throw new AgentProblemException(AgentFaults.InvalidRequest(details.Length > 0 ? $"{ex.Problem.Message} {details}" : ex.Problem.Message));
        }
        catch (AssemblyInspectionValidationException ex)
        {
            throw new AgentProblemException(AgentFaults.InvalidRequest(ex.Message));
        }
    }
}

/// <summary>
/// Plans plugin_deploy. A .dll is registered, or updated when its content differs; plug-in types new in the file are
/// added by the update, and types the file no longer has are reported and block the update, never deleted. A .nupkg
/// needs plug-in packages (online); without them the step is unsupported.
/// </summary>
public sealed class PluginDeployPlanner(IPluginAssemblyInspector inspector) : IComponentPlanner<PluginDeploySpec>
{
    public const string Family = "plugin_deploy";
    public const string PackageTable = "pluginpackage";

    public async Task<Plan> PlanAsync(PluginDeploySpec spec, PlanContext context, CancellationToken ct)
    {
        var path = spec.Path?.Trim() ?? "";
        if (!System.IO.Path.IsPathFullyQualified(path)) throw Invalid("path must be an absolute path.");
        if (!File.Exists(path)) throw Invalid($"The file {path} does not exist.");
        var info = new FileInfo(path);
        if (info.Length is 0 or > PowerTools.API.Tools.PluginRegistration.Inspection.PluginAssemblyInspector.MaxAssemblyBytes) throw Invalid("The file must be from 1 byte to 16 MB.");
        await context.SolutionAsync(spec.Solution, ct);
        var bytes = await File.ReadAllBytesAsync(path, ct);
        var hash = Convert.ToHexStringLower(SHA256.HashData(bytes));

        return System.IO.Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".dll" => await AssemblyAsync(spec, context, path, bytes, hash, ct),
            ".nupkg" => await PackageAsync(spec, context, bytes, hash, ct),
            _ => throw Invalid("path must be a .dll or a .nupkg."),
        };
    }

    private async Task<Plan> AssemblyAsync(PluginDeploySpec spec, PlanContext context, string path, byte[] bytes, string hash, CancellationToken ct)
    {
        AssemblyInspectionDto inspection;
        try
        {
            await using var stream = new MemoryStream(bytes);
            inspection = await inspector.InspectAsync(stream, System.IO.Path.GetFileName(path), bytes.Length, ct);
        }
        catch (AssemblyInspectionValidationException ex)
        {
            throw Invalid(ex.Message);
        }

        var errors = inspection.Diagnostics.Where(d => d.Severity == AssemblyInspectionDiagnosticSeverity.Error).Select(d => d.Message).ToList();
        if (errors.Count > 0) throw Invalid($"The assembly cannot be registered: {string.Join("; ", errors)}");
        var name = inspection.Identity.Name;
        var types = inspection.Plugins.Select(p => p.TypeName).Concat(inspection.WorkflowActivities.Select(a => a.TypeName)).ToList();
        var gateway = new AgentPluginGateway(context.Client);
        var lockKey = $"pluginassembly:{name.ToLowerInvariant()}";
        var fileName = System.IO.Path.GetFileName(path);

        var query = new QueryExpression("pluginassembly") { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet("name", "version", "content", "ismanaged", "isolationmode") };
        query.Criteria.AddCondition("name", ConditionOperator.Equal, name);
        var existing = (await context.Client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault();
        var sandboxOnly = context.Capabilities.HasTable(PackageTable);
        var isolation = spec.IsolationMode ?? IsolationMode.Sandbox;
        var steps = new List<PlanStep>();

        if (existing is null)
        {
            if (isolation == IsolationMode.None && sandboxOnly)
                return new Plan([PlanStep.Blocked("registerAssembly", name, "This environment runs plug-ins only in the sandbox; isolationMode none is for on-premises.")], lockKeys: [lockKey]);
            steps.Add(new PlanStep
            {
                Op = "registerAssembly",
                Target = name,
                Detail = $"version {inspection.Identity.Version}; {isolation.ToString().ToLowerInvariant()}; sha256 {hash}; types {string.Join(", ", types)}",
                Action = (step, token) => PluginErrors.Run(async () =>
                {
                    await using var stream = new MemoryStream(bytes);
                    var result = await new AssemblyService(new AgentPluginGateway(step.Client), inspector).RegisterAsync(
                        stream, fileName, bytes.Length,
                        new AssemblyRegisterRequest(isolation == IsolationMode.None ? RegistrationOptionValues.IsolationNone : RegistrationOptionValues.IsolationSandbox, RegistrationOptionValues.SourceDatabase),
                        CapabilitiesService.For(sandboxOnly), token);
                    step.Ids.Add(result.Id.ToString("D"));
                    await AddToSolutionAsync(step, result.Id, ComponentKinds.PluginAssemblyType, token);
                }),
            });
            return new Plan(steps, lockKeys: [lockKey]);
        }

        if (existing.GetAttributeValue<bool?>("ismanaged") == true)
            return new Plan([PlanStep.Blocked("updateAssembly", name, $"Assembly {name} is managed; it changes by importing its solution.")], lockKeys: [lockKey]);

        var registered = (await gateway.RetrieveAllAsync(CatalogQueries.TypesForAssembly(existing.Id), ct))
            .Select(t => t.GetAttributeValue<string>("typename")).OfType<string>().ToHashSet(StringComparer.OrdinalIgnoreCase);
        var removed = registered.Where(t => !types.Contains(t, StringComparer.OrdinalIgnoreCase)).Order().ToList();
        var added = types.Where(t => !registered.Contains(t)).ToList();
        var content = existing.GetAttributeValue<string>("content");
        var same = content is not null && Convert.ToHexStringLower(SHA256.HashData(Convert.FromBase64String(content))) == hash;
        if (!same || added.Count > 0)
        {
            if (removed.Count > 0)
            {
                steps.Add(PlanStep.Blocked("updateAssembly", name,
                    $"The file no longer has plug-in types that are registered: {string.Join(", ", removed)}. Remove their steps and the types (remove kind plugintype), or put them back."));
            }
            else
            {
                var id = existing.Id;
                steps.Add(new PlanStep
                {
                    Op = "updateAssembly",
                    Target = name,
                    Detail = $"version {existing.GetAttributeValue<string>("version")} → {inspection.Identity.Version}; sha256 {hash}{(added.Count == 0 ? "" : $"; new types {string.Join(", ", added)}")}",
                    SolutionAware = false,
                    Action = (step, token) => PluginErrors.Run(async () =>
                    {
                        await using var stream = new MemoryStream(bytes);
                        await new AssemblyService(new AgentPluginGateway(step.Client), inspector).UpdateAsync(id, stream, fileName, bytes.Length, token);
                    }),
                });
            }
        }

        var solution = await Solutions.SolutionPlanner.FindSolutionAsync(context.Client, spec.Solution, ct);
        if (solution is not null && !await ComponentKinds.InSolutionAsync(context.Client, solution.Id, existing.Id, ct))
        {
            steps.Add(new PlanStep
            {
                Op = "addComponent",
                Target = name,
                Detail = $"plug-in assembly {existing.Id:D}",
                SolutionAware = false,
                Request = new AddSolutionComponentRequest
                {
                    ComponentId = existing.Id,
                    ComponentType = ComponentKinds.PluginAssemblyType,
                    SolutionUniqueName = spec.Solution.Trim(),
                    AddRequiredComponents = false,
                },
            });
        }

        return new Plan(steps, lockKeys: [lockKey]);
    }

    private static async Task<Plan> PackageAsync(PluginDeploySpec spec, PlanContext context, byte[] bytes, string hash, CancellationToken ct)
    {
        var (id, version) = ReadNuspec(bytes);
        var lockKey = $"pluginpackage:{id.ToLowerInvariant()}";
        if (!context.Capabilities.HasTable(PackageTable))
        {
            return new Plan(
                [PlanStep.Unsupported("deployPackage", id, "This environment has no plug-in packages (they are online only).", "Build the plug-in as a single .dll assembly and deploy that.")],
                lockKeys: [lockKey]);
        }

        var query = new QueryExpression(PackageTable) { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet("name", "version", "ismanaged") };
        query.Criteria.AddCondition("name", ConditionOperator.Equal, id);
        var existing = (await context.Client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault();
        var content = Convert.ToBase64String(bytes);
        if (existing is null)
        {
            var solution = await context.SolutionAsync(spec.Solution, ct);
            var unique = id.StartsWith($"{solution.Prefix}_", StringComparison.OrdinalIgnoreCase) ? id : $"{solution.Prefix}_{id}";
            return new Plan(
                [new PlanStep
                {
                    Op = "createPackage",
                    Target = id,
                    Detail = $"version {version}; unique name {unique}; sha256 {hash}",
                    Request = new CreateRequest { Target = new Entity(PackageTable) { ["name"] = id, ["uniquename"] = unique, ["version"] = version, ["content"] = content } },
                }],
                lockKeys: [lockKey]);
        }

        if (existing.GetAttributeValue<bool?>("ismanaged") == true)
            return new Plan([PlanStep.Blocked("updatePackage", id, $"Package {id} is managed.")], lockKeys: [lockKey]);
        if (existing.GetAttributeValue<string>("version") == version)
            return new Plan([], [$"Package {id} already has version {version}. Raise the package version to deploy a new build."], [lockKey]);
        return new Plan(
            [new PlanStep
            {
                Op = "updatePackage",
                Target = id,
                Detail = $"version {existing.GetAttributeValue<string>("version")} → {version}; sha256 {hash}",
                Request = new UpdateRequest { Target = new Entity(PackageTable, existing.Id) { ["version"] = version, ["content"] = content } },
            }],
            lockKeys: [lockKey]);
    }

    /// <summary>The package id and version from the .nuspec inside a .nupkg.</summary>
    internal static (string Id, string Version) ReadNuspec(byte[] bytes)
    {
        try
        {
            using var zip = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
            var entry = zip.Entries.FirstOrDefault(e => e.FullName.EndsWith(".nuspec", StringComparison.OrdinalIgnoreCase) && !e.FullName.Contains('/'))
                ?? throw Invalid("The .nupkg has no .nuspec.");
            using var stream = entry.Open();
            var doc = XDocument.Load(stream);
            var metadata = doc.Root?.Elements().FirstOrDefault(e => e.Name.LocalName == "metadata");
            string? Value(string name) => metadata?.Elements().FirstOrDefault(e => e.Name.LocalName == name)?.Value.Trim();
            return (Value("id") ?? throw Invalid("The .nuspec has no id."), Value("version") ?? throw Invalid("The .nuspec has no version."));
        }
        catch (InvalidDataException)
        {
            throw Invalid("The .nupkg is not a valid package.");
        }
    }

    internal static async Task AddToSolutionAsync(StepContext step, Guid id, int type, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(step.SolutionUniqueName)) return;
        await step.Client.ExecuteAsync(new AddSolutionComponentRequest
        {
            ComponentId = id,
            ComponentType = type,
            SolutionUniqueName = step.SolutionUniqueName,
            AddRequiredComponents = false,
        }, ct);
    }

    internal static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
