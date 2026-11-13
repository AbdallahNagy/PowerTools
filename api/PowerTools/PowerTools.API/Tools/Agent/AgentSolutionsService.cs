using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.SolutionComponentsMover;
using PowerTools.API.Tools.SolutionLayers;

namespace PowerTools.API.Tools.Agent;

// ── Requests and responses ───────────────────────────────────────────────────

public sealed class CreateSolutionBody
{
    public string? UniqueName { get; set; }
    public string? DisplayName { get; set; }
    public string? Publisher { get; set; }
    public string? Version { get; set; }
    public string? Description { get; set; }
}

public sealed class CreatePatchBody
{
    public string? Solution { get; set; }
    public string? DisplayName { get; set; }
    public string? Version { get; set; }
}

public sealed class CloneSolutionBody
{
    public string? Solution { get; set; }
    public string? DisplayName { get; set; }
    public string? Version { get; set; }
}

public sealed class SolutionComponentBody
{
    public string? Solution { get; set; }
    /// <summary>A component type number, or one of table, column, form, view, pluginassembly, pluginstep, envvar.</summary>
    public JsonElement ComponentType { get; set; }
    public string? ComponentId { get; set; }
    public string? Table { get; set; }
    public string? Column { get; set; }
    public bool? AddRequiredComponents { get; set; }
}

public sealed class DeleteSolutionBody
{
    public string? Solution { get; set; }
}

public sealed record SolutionDeletedDto(string UniqueName, Guid Id);

public sealed class RemoveActiveLayerBody
{
    public int? ComponentType { get; set; }
    public string? ComponentId { get; set; }
}

public sealed record AgentSolutionDto(
    string UniqueName, string FriendlyName, string Version, bool IsManaged, bool IsPatch, string? Publisher, string Id);

public sealed record SolutionComponentDto(string ComponentId, int ComponentType, string? TypeName);

public sealed record SolutionComponentsDto(IReadOnlyList<SolutionComponentDto> Components, bool Truncated);

public sealed record SolutionCreatedDto(string UniqueName, Guid Id, string Version);

public sealed record SolutionComponentChangedDto(string Solution, int ComponentType, Guid ComponentId);

/// <summary>Solutions, patches, components and layers for the agent tools. Reuses the existing solution services.</summary>
public sealed partial class AgentSolutionsService(IAgentClient client, ISolutionLayersCache cache, string connectionKey)
{
    public const int MaxComponents = 500;

    [GeneratedRegex(@"^\d+\.\d+\.\d+\.\d+$")]
    private static partial Regex VersionPattern();

    [GeneratedRegex("^[A-Za-z_][A-Za-z0-9_]*$")]
    private static partial Regex UniqueNamePattern();

    // Names an agent may use for the components it is most likely to move.
    private static readonly Dictionary<string, int> TypeNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ["table"] = ComponentLayerNames.Entity,
        ["column"] = ComponentLayerNames.Attribute,
        ["form"] = ComponentLayerNames.SystemForm,
        ["view"] = ComponentLayerNames.SavedQuery,
        ["pluginassembly"] = ComponentLayerNames.PluginAssembly,
        ["pluginstep"] = ComponentLayerNames.SdkMessageProcessingStep,
        ["envvar"] = SolutionComponentsMoverLimits.EnvironmentVariableDefinition,
    };

    // ── Reads ────────────────────────────────────────────────────────────────

    public Task<AgentResult<IReadOnlyList<AgentSolutionDto>>> ListAsync(bool unmanagedOnly, CancellationToken ct) =>
        Guard<IReadOnlyList<AgentSolutionDto>>(async () =>
        {
            var read = await new SolutionComponentsMoverService(client).GetSolutionsAsync(ct);
            if (read.Problem is not null) return AgentResult<IReadOnlyList<AgentSolutionDto>>.Fail(AgentFaults.FromExternal(read.Problem.Status, read.Problem.Code, read.Problem.Message));
            return AgentResult<IReadOnlyList<AgentSolutionDto>>.Ok(read.Value!.Solutions
                .Where(s => !unmanagedOnly || !s.IsManaged)
                .Select(s => new AgentSolutionDto(s.UniqueName, s.FriendlyName, s.Version, s.IsManaged, s.IsPatch, s.PublisherName, s.Id))
                .ToList());
        });

    public Task<AgentResult<SolutionComponentsDto>> ListComponentsAsync(string uniqueName, int? componentType, CancellationToken ct) =>
        Guard(async () =>
        {
            var solution = await RequireSolutionAsync(uniqueName, ct);
            var query = new QueryExpression("solutioncomponent")
            {
                NoLock = true,
                TopCount = MaxComponents + 1,
                ColumnSet = new ColumnSet("objectid", "componenttype"),
            };
            query.Criteria.AddCondition("solutionid", ConditionOperator.Equal, solution.Id);
            if (componentType is { } type) query.Criteria.AddCondition("componenttype", ConditionOperator.Equal, type);
            query.Orders.Add(new OrderExpression("componenttype", OrderType.Ascending));

            var rows = await client.RetrieveMultipleAsync(query, ct);
            static int TypeOf(Entity row) =>
                row.GetAttributeValue<OptionSetValue>("componenttype")?.Value ?? row.GetAttributeValue<int?>("componenttype") ?? 0;
            var kept = rows.Entities.Take(MaxComponents).ToList();
            var names = await ComponentTypeNamesAsync(kept.Select(TypeOf), ct);
            var components = kept
                .Select(row =>
                {
                    var type = TypeOf(row);
                    return new SolutionComponentDto(
                        (row.GetAttributeValue<Guid?>("objectid") ?? Guid.Empty).ToString("D"),
                        type,
                        names.GetValueOrDefault(type));
                })
                .ToList();
            return AgentResult<SolutionComponentsDto>.Ok(new SolutionComponentsDto(components, rows.Entities.Count > MaxComponents));
        });

    public Task<AgentResult<LayersResponse>> GetLayersAsync(int? componentType, string? componentId, CancellationToken ct) =>
        Guard(async () => FromLayers(await Layers().GetLayersAsync(componentType, componentId, ct)));

    // ── Creates ──────────────────────────────────────────────────────────────

    public Task<AgentResult<SolutionCreatedDto>> CreateAsync(CreateSolutionBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.UniqueName, "uniqueName");
            Require(body.DisplayName, "displayName");
            if (!UniqueNamePattern().IsMatch(body.UniqueName!))
                throw Invalid("uniqueName may only contain letters, digits and underscores, and must not start with a digit.");
            var version = body.Version ?? "1.0.0.0";
            if (!VersionPattern().IsMatch(version)) throw Invalid("version must look like 1.0.0.0.");

            var resolved = await AgentPublishers.ResolveAsync(client, null, body.Publisher, ct);
            if (resolved.Problem is not null) return AgentResult<SolutionCreatedDto>.Fail(resolved.Problem);
            if (await FindSolutionAsync(body.UniqueName!, ct) is not null)
                throw Invalid($"A solution named '{body.UniqueName}' already exists.");

            var entity = new Entity("solution")
            {
                ["uniquename"] = body.UniqueName,
                ["friendlyname"] = body.DisplayName,
                ["version"] = version,
                ["publisherid"] = new EntityReference("publisher", resolved.Value!.Id),
            };
            if (!string.IsNullOrWhiteSpace(body.Description)) entity["description"] = body.Description;
            var id = await client.CreateAsync(entity, ct);
            return AgentResult<SolutionCreatedDto>.Ok(new SolutionCreatedDto(body.UniqueName!, id, version));
        });

    /// <summary>Clones the solution as a patch. Without a version, one build number above the parent and its patches.</summary>
    public Task<AgentResult<SolutionCreatedDto>> CreatePatchAsync(CreatePatchBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Solution, "solution");
            var parent = await RequireSolutionAsync(body.Solution!, ct);
            if (parent.GetAttributeValue<bool?>("ismanaged") == true) throw Invalid($"Solution '{body.Solution}' is managed and cannot be patched.");
            if (parent.GetAttributeValue<EntityReference>("parentsolutionid") is not null)
                throw Invalid($"Solution '{body.Solution}' is itself a patch; patch its parent instead.");

            var version = body.Version;
            if (version is null)
            {
                var patches = await ChildVersionsAsync(parent.Id, ct);
                version = NextPatchVersion(parent.GetAttributeValue<string>("version") ?? "1.0.0.0", patches);
            }
            else if (!VersionPattern().IsMatch(version))
            {
                throw Invalid("version must look like 1.0.1.0.");
            }

            var response = await client.ExecuteAsync(
                new CloneAsPatchRequest
                {
                    ParentSolutionUniqueName = body.Solution,
                    DisplayName = string.IsNullOrWhiteSpace(body.DisplayName) ? parent.GetAttributeValue<string>("friendlyname") : body.DisplayName,
                    VersionNumber = version,
                },
                ct);
            var id = response.Results.TryGetValue("SolutionId", out var raw) && raw is Guid guid ? guid : Guid.Empty;
            // Dataverse names the patch itself (for example Core_Patch_1a2b3c4d), so read the name back.
            var unique = id == Guid.Empty ? null : await UniqueNameOfAsync(id, ct);
            unique ??= response.Results.TryGetValue("UniqueName", out var name) && name is string text
                ? text
                : $"{body.Solution}_Patch{version.Replace('.', '_')}";
            return AgentResult<SolutionCreatedDto>.Ok(new SolutionCreatedDto(unique, id, version));
        });

    /// <summary>The next patch version: the parent's major and minor, one build above the highest of the parent and its patches.</summary>
    public static string NextPatchVersion(string parentVersion, IEnumerable<string> patchVersions)
    {
        var parts = Parse(parentVersion);
        var build = parts.Build;
        foreach (var patch in patchVersions)
        {
            var other = Parse(patch);
            if (other.Major == parts.Major && other.Minor == parts.Minor) build = Math.Max(build, other.Build);
        }

        return $"{parts.Major}.{parts.Minor}.{build + 1}.0";
    }

    private static (int Major, int Minor, int Build) Parse(string version)
    {
        var numbers = version.Split('.').Select(part => int.TryParse(part, out var n) ? n : 0).Concat([0, 0, 0]).ToArray();
        return (numbers[0], numbers[1], numbers[2]);
    }

    /// <summary>Rolls the patches into the solution and gives it the new version. This removes the patches.</summary>
    public Task<AgentResult<SolutionCreatedDto>> CloneAsync(CloneSolutionBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Solution, "solution");
            Require(body.Version, "version");
            if (!VersionPattern().IsMatch(body.Version!)) throw Invalid("version must look like 2.0.0.0.");
            var parent = await RequireSolutionAsync(body.Solution!, ct);
            if (parent.GetAttributeValue<bool?>("ismanaged") == true) throw Invalid($"Solution '{body.Solution}' is managed and cannot be cloned.");
            if (parent.GetAttributeValue<EntityReference>("parentsolutionid") is not null)
                throw Invalid($"Solution '{body.Solution}' is a patch; only a parent solution can be cloned.");

            var response = await client.ExecuteAsync(
                new CloneAsSolutionRequest
                {
                    ParentSolutionUniqueName = body.Solution,
                    DisplayName = string.IsNullOrWhiteSpace(body.DisplayName) ? parent.GetAttributeValue<string>("friendlyname") : body.DisplayName,
                    VersionNumber = body.Version,
                },
                ct);
            var id = response.Results.TryGetValue("SolutionId", out var raw) && raw is Guid guid ? guid : Guid.Empty;
            return AgentResult<SolutionCreatedDto>.Ok(new SolutionCreatedDto(body.Solution!, id, body.Version!));
        });

    // ── Components ───────────────────────────────────────────────────────────

    public Task<AgentResult<SolutionComponentChangedDto>> AddComponentAsync(SolutionComponentBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            var (type, id) = await ResolveComponentAsync(body, ct);
            await client.ExecuteAsync(
                new AddSolutionComponentRequest
                {
                    ComponentId = id,
                    ComponentType = type,
                    SolutionUniqueName = body.Solution,
                    AddRequiredComponents = body.AddRequiredComponents ?? false,
                },
                ct);
            return AgentResult<SolutionComponentChangedDto>.Ok(new SolutionComponentChangedDto(body.Solution!, type, id));
        });

    public Task<AgentResult<SolutionComponentChangedDto>> RemoveComponentAsync(SolutionComponentBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            var (type, id) = await ResolveComponentAsync(body, ct);
            await client.ExecuteAsync(
                new RemoveSolutionComponentRequest { ComponentId = id, ComponentType = type, SolutionUniqueName = body.Solution },
                ct);
            return AgentResult<SolutionComponentChangedDto>.Ok(new SolutionComponentChangedDto(body.Solution!, type, id));
        });

    /// <summary>Turns a component type (number or name) and an id (given, or looked up from table and column) into numbers and a GUID.</summary>
    private async Task<(int Type, Guid Id)> ResolveComponentAsync(SolutionComponentBody body, CancellationToken ct)
    {
        Require(body.Solution, "solution");
        await RequireSolutionAsync(body.Solution!, ct);

        int type;
        switch (body.ComponentType.ValueKind)
        {
            case JsonValueKind.Number when body.ComponentType.TryGetInt32(out var number) && number > 0:
                type = number;
                break;
            case JsonValueKind.String when TypeNames.TryGetValue(body.ComponentType.GetString() ?? "", out var named):
                type = named;
                break;
            default:
                throw Invalid($"componentType must be a component type number or one of: {string.Join(", ", TypeNames.Keys)}.");
        }

        if (!string.IsNullOrWhiteSpace(body.ComponentId))
        {
            return Guid.TryParse(body.ComponentId, out var given) ? (type, given) : throw Invalid("componentId must be a GUID.");
        }

        if (type == ComponentLayerNames.Entity && !string.IsNullOrWhiteSpace(body.Table))
        {
            var response = (RetrieveEntityResponse)await client.ExecuteAsync(
                new RetrieveEntityRequest { LogicalName = body.Table!.ToLowerInvariant(), EntityFilters = EntityFilters.Entity }, ct);
            return (type, response.EntityMetadata?.MetadataId ?? throw Invalid($"Table '{body.Table}' has no metadata id."));
        }

        if (type == ComponentLayerNames.Attribute && !string.IsNullOrWhiteSpace(body.Table) && !string.IsNullOrWhiteSpace(body.Column))
        {
            var response = (RetrieveAttributeResponse)await client.ExecuteAsync(
                new RetrieveAttributeRequest
                {
                    EntityLogicalName = body.Table!.ToLowerInvariant(),
                    LogicalName = body.Column!.ToLowerInvariant(),
                    RetrieveAsIfPublished = true,
                },
                ct);
            return (type, response.AttributeMetadata?.MetadataId ?? throw Invalid($"Column '{body.Column}' has no metadata id."));
        }

        throw Invalid("Give componentId, or table (for a table) or table and column (for a column).");
    }

    // ── Delete ───────────────────────────────────────────────────────────────

    private static readonly HashSet<string> SystemSolutions = new(StringComparer.OrdinalIgnoreCase) { "Default", "Active", "Basic" };

    /// <summary>
    /// Deletes an unmanaged solution. Its components stay in the environment; only the solution goes. Managed
    /// solutions are refused, because deleting one uninstalls everything in it.
    /// </summary>
    public Task<AgentResult<SolutionDeletedDto>> DeleteAsync(DeleteSolutionBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Solution, "solution");
            var solution = await RequireSolutionAsync(body.Solution!, ct);
            var uniqueName = solution.GetAttributeValue<string>("uniquename") ?? body.Solution!.Trim();
            if (SystemSolutions.Contains(uniqueName) || solution.GetAttributeValue<bool?>("isvisible") == false)
                throw Invalid($"Solution '{uniqueName}' is a system solution and cannot be deleted.");
            if (solution.GetAttributeValue<bool?>("ismanaged") == true)
                throw Invalid($"Solution '{uniqueName}' is managed. Deleting it would uninstall its components; do that in the maker portal.");

            await client.DeleteAsync("solution", solution.Id, ct);
            return AgentResult<SolutionDeletedDto>.Ok(new SolutionDeletedDto(uniqueName, solution.Id));
        });

    /// <summary>
    /// Names component types: the documented ones by number, the rest (solution-aware tables, numbered above
    /// 10000 and different in every environment) from solutioncomponentdefinition. A type it cannot name stays out.
    /// </summary>
    private async Task<Dictionary<int, string>> ComponentTypeNamesAsync(IEnumerable<int> types, CancellationToken ct)
    {
        var names = new Dictionary<int, string>();
        var unknown = new List<int>();
        foreach (var type in types.Distinct())
        {
            var known = type == ModelDrivenAppType ? ComponentLayerNames.AppModuleName : ComponentLayerNames.ClassicLayerName(type);
            if (known is not null) names[type] = known;
            else unknown.Add(type);
        }

        if (unknown.Count == 0) return names;
        try
        {
            var query = new QueryExpression("solutioncomponentdefinition") { NoLock = true, ColumnSet = new ColumnSet("name", "solutioncomponenttype") };
            query.Criteria.AddCondition("solutioncomponenttype", ConditionOperator.In, unknown.Cast<object>().ToArray());
            foreach (var row in (await client.RetrieveMultipleAsync(query, ct)).Entities)
            {
                var number = row.GetAttributeValue<int?>("solutioncomponenttype") ?? row.GetAttributeValue<OptionSetValue>("solutioncomponenttype")?.Value;
                var name = row.GetAttributeValue<string>("name");
                if (number is int value && !string.IsNullOrWhiteSpace(name)) names[value] = name;
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // solutioncomponentdefinition is not a documented table; without it those types stay unnamed.
        }

        return names;
    }

    /// <summary>Model-driven apps (appmodule) are component type 80.</summary>
    private const int ModelDrivenAppType = 80;

    // ── Layers ───────────────────────────────────────────────────────────────

    public Task<AgentResult<LayersResponse>> RemoveActiveLayerAsync(RemoveActiveLayerBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            if (body.ComponentType is not int type) throw Invalid("componentType is required.");
            return FromLayers(await Layers().RemoveActiveAsync(new RemoveActiveBody(type, body.ComponentId), ct));
        });

    // ── Helpers ──────────────────────────────────────────────────────────────

    private SolutionLayersService Layers() => new(client, cache, connectionKey);

    private static AgentResult<LayersResponse> FromLayers(SolutionLayersResult<LayersResponse> result) =>
        result.Problem is null
            ? AgentResult<LayersResponse>.Ok(result.Value!)
            : AgentResult<LayersResponse>.Fail(AgentFaults.FromExternal(result.Problem.Status, result.Problem.Code, result.Problem.Message));

    private async Task<Entity?> FindSolutionAsync(string uniqueName, CancellationToken ct)
    {
        var query = new QueryExpression("solution")
        {
            NoLock = true,
            TopCount = 1,
            ColumnSet = new ColumnSet("uniquename", "friendlyname", "version", "ismanaged", "parentsolutionid", "isvisible"),
        };
        query.Criteria.AddCondition("uniquename", ConditionOperator.Equal, uniqueName.Trim());
        return (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault();
    }

    private async Task<string?> UniqueNameOfAsync(Guid solutionId, CancellationToken ct)
    {
        try
        {
            var row = await client.RetrieveAsync("solution", solutionId, new ColumnSet("uniquename"), ct);
            return row.GetAttributeValue<string>("uniquename");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return null;
        }
    }

    private async Task<Entity> RequireSolutionAsync(string uniqueName, CancellationToken ct) =>
        await FindSolutionAsync(uniqueName, ct) ?? throw new AgentProblemException(AgentFaults.NotFound($"Solution '{uniqueName}' was not found."));

    private async Task<IReadOnlyList<string>> ChildVersionsAsync(Guid parentId, CancellationToken ct)
    {
        var query = new QueryExpression("solution") { NoLock = true, ColumnSet = new ColumnSet("version") };
        query.Criteria.AddCondition("parentsolutionid", ConditionOperator.Equal, parentId);
        var rows = await client.RetrieveMultipleAsync(query, ct);
        return rows.Entities.Select(row => row.GetAttributeValue<string>("version") ?? "").Where(v => v.Length > 0).ToList();
    }

    private static async Task<AgentResult<T>> Guard<T>(Func<Task<AgentResult<T>>> work)
    {
        try
        {
            return await work();
        }
        catch (Exception ex)
        {
            return AgentResult<T>.Fail(AgentFaults.From(ex));
        }
    }

    private static void Require(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value)) throw Invalid($"{field} is required.");
    }

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
