using PowerTools.API.Tools.EnvironmentVariables;

namespace PowerTools.API.Tools.Agent;

public sealed class CreateEnvVarDefinitionBody
{
    public string? SchemaName { get; set; }
    public string? DisplayName { get; set; }
    /// <summary>string, number, boolean, json, secret or datasource.</summary>
    public string? Type { get; set; }
    public string? DefaultValue { get; set; }
    public string? Description { get; set; }
    public string? Solution { get; set; }
    public string? Publisher { get; set; }
}

public sealed class SetEnvVarValueBody
{
    /// <summary>Schema name of the definition.</summary>
    public string? Definition { get; set; }
    public string? Value { get; set; }
}

public sealed class DeleteEnvVarBody
{
    /// <summary>definition, or value (the current value only).</summary>
    public string? Kind { get; set; }
    public string? SchemaName { get; set; }
}

/// <summary>A variable without ids. Secret values are never returned.</summary>
public sealed record AgentEnvVarDto(
    string SchemaName,
    string? DisplayName,
    string? Description,
    string Type,
    string? DefaultValue,
    string? CurrentValue,
    bool HasCurrentValue,
    bool IsManaged,
    bool IsCustomizable);

public sealed record EnvVarChangedDto(string SchemaName, string? Note);

/// <summary>Environment variables for the agent tools. It runs the existing service and its rules.</summary>
public sealed class AgentEnvVarsService(IAgentClient client, bool onPremises)
{
    private static readonly Dictionary<string, EnvironmentVariableType> Types = new(StringComparer.OrdinalIgnoreCase)
    {
        ["string"] = EnvironmentVariableType.String,
        ["number"] = EnvironmentVariableType.Number,
        ["boolean"] = EnvironmentVariableType.Boolean,
        ["json"] = EnvironmentVariableType.Json,
        ["datasource"] = EnvironmentVariableType.DataSource,
        ["secret"] = EnvironmentVariableType.Secret,
    };

    private EnvironmentVariablesService Service => new(client, onPremises);

    public Task<AgentResult<IReadOnlyList<AgentEnvVarDto>>> ListAsync(CancellationToken ct) =>
        Guard<IReadOnlyList<AgentEnvVarDto>>(async () =>
        {
            var read = await Service.ListAsync(ct);
            if (read.Problem is not null) return Fail<IReadOnlyList<AgentEnvVarDto>>(read.Problem);
            return AgentResult<IReadOnlyList<AgentEnvVarDto>>.Ok(read.Value!.Select(ToAgent).ToList());
        });

    public Task<AgentResult<EnvVarChangedDto>> CreateDefinitionAsync(CreateEnvVarDefinitionBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.SchemaName, "schemaName");
            Require(body.DisplayName, "displayName");
            if (body.Type is null || !Types.TryGetValue(body.Type, out var type))
                throw Invalid($"type must be one of: {string.Join(", ", Types.Keys)}.");

            // Publisher rules first: the prefix check and the publisher must be settled before anything is written.
            var publisher = await AgentPublishers.ResolveAsync(client, body.Solution, body.Publisher, ct);
            if (publisher.Problem is not null) return AgentResult<EnvVarChangedDto>.Fail(publisher.Problem);
            var mismatch = AgentPublishers.CheckSchemaName(body.SchemaName!.Trim(), publisher.Value!);
            if (mismatch is not null) return AgentResult<EnvVarChangedDto>.Fail(mismatch);

            var created = await Service.CreateDefinitionAsync(
                new CreateDefinitionBody(
                    body.SchemaName.Trim(), body.DisplayName!.Trim(), body.Description, (int)type, body.DefaultValue, null,
                    string.IsNullOrWhiteSpace(body.Solution) ? null : body.Solution.Trim()),
                ct);
            if (created.Problem is not null) return Fail<EnvVarChangedDto>(created.Problem);
            return AgentResult<EnvVarChangedDto>.Ok(new EnvVarChangedDto(created.Value!.Variable.SchemaName, null));
        });

    /// <summary>Sets the current value of a variable, creating the value row or updating it.</summary>
    public Task<AgentResult<EnvVarChangedDto>> SetValueAsync(SetEnvVarValueBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.Definition, "definition");
            if (body.Value is null) throw Invalid("value is required.");
            var variable = await FindAsync(body.Definition!, ct);
            var saved = await Service.SaveValuesAsync(
                new SaveValuesBody([new SaveValueItem(variable.DefinitionId, variable.ValueId, body.Value)]),
                ct);
            if (saved.Problem is not null) return Fail<EnvVarChangedDto>(saved.Problem);
            var result = saved.Value!.Results.Single();
            if (!result.Ok)
                return AgentResult<EnvVarChangedDto>.Fail(AgentFaults.InvalidRequest(result.Error ?? "The value could not be saved."));
            return AgentResult<EnvVarChangedDto>.Ok(new EnvVarChangedDto(variable.SchemaName, variable.ValueId is null ? "Value created." : "Value updated."));
        });

    public Task<AgentResult<EnvVarChangedDto>> DeleteAsync(DeleteEnvVarBody body, CancellationToken ct) =>
        Guard(async () =>
        {
            Require(body.SchemaName, "schemaName");
            var variable = await FindAsync(body.SchemaName!, ct);
            switch (body.Kind?.ToLowerInvariant())
            {
                case "definition":
                    var definition = await Service.DeleteDefinitionAsync(variable.DefinitionId, ct);
                    if (definition.Problem is not null) return Fail<EnvVarChangedDto>(definition.Problem);
                    var left = definition.Value!.RemainingValueIds.Count;
                    return AgentResult<EnvVarChangedDto>.Ok(new EnvVarChangedDto(
                        variable.SchemaName, left > 0 ? $"{left} value row(s) were left behind." : null));
                case "value":
                    if (variable.ValueId is null)
                        return AgentResult<EnvVarChangedDto>.Fail(AgentFaults.NotFound($"'{variable.SchemaName}' has no current value."));
                    var value = await Service.DeleteValueAsync(variable.ValueId, ct);
                    return value.Problem is not null ? Fail<EnvVarChangedDto>(value.Problem) : AgentResult<EnvVarChangedDto>.Ok(new EnvVarChangedDto(variable.SchemaName, null));
                default:
                    throw Invalid("kind must be definition or value.");
            }
        });

    // ── Helpers ──────────────────────────────────────────────────────────────

    private async Task<EnvironmentVariableDto> FindAsync(string schemaName, CancellationToken ct)
    {
        var read = await Service.ListAsync(ct);
        if (read.Problem is not null)
            throw new AgentProblemException(AgentFaults.FromExternal(read.Problem.Status, read.Problem.Code, read.Problem.Message));
        return read.Value!.FirstOrDefault(v => string.Equals(v.SchemaName, schemaName.Trim(), StringComparison.OrdinalIgnoreCase))
            ?? throw new AgentProblemException(AgentFaults.NotFound($"Environment variable '{schemaName}' was not found."));
    }

    private static AgentEnvVarDto ToAgent(EnvironmentVariableDto v)
    {
        var secret = v.Type == (int)EnvironmentVariableType.Secret;
        return new AgentEnvVarDto(
            v.SchemaName, v.DisplayName, v.Description, v.TypeLabel,
            secret ? null : v.DefaultValue,
            secret ? null : v.CurrentValue,
            v.ValueId is not null,
            v.IsManaged, v.IsCustomizable);
    }

    private static AgentResult<T> Fail<T>(EnvironmentVariablesProblem problem) =>
        AgentResult<T>.Fail(AgentFaults.FromExternal(problem.Status, problem.Code, problem.Message));

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
