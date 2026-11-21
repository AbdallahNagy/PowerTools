using System.ComponentModel;
using System.Text.Json.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tools.Agent.Components.Config;

[JsonConverter(typeof(JsonStringEnumConverter<EnvVarType>))]
public enum EnvVarType
{
    [JsonStringEnumMemberName("string")] String,
    [JsonStringEnumMemberName("number")] Number,
    [JsonStringEnumMemberName("boolean")] Boolean,
    [JsonStringEnumMemberName("json")] Json,
    [JsonStringEnumMemberName("datasource")] DataSource,
}

[Description("Environment variables (definitions and values) and connection references.")]
public sealed class ConfigApplySpec : IApplySpec
{
    [Description("Unique name of the unmanaged solution new definitions go into. Its publisher decides the prefix.")]
    public required string Solution { get; init; }

    public List<EnvVarDefinition>? EnvironmentVariables { get; init; }

    [Description("Connection references. Online only.")]
    public List<ConnectionReferenceDefinition>? ConnectionReferences { get; init; }
}

public sealed class EnvVarDefinition
{
    [Description("Schema name with the publisher prefix, for example con_ApiUrl.")]
    public required string SchemaName { get; init; }

    [Description("Needed for a new definition.")]
    public string? DisplayName { get; init; }

    [Description("Fixed when created. Default string. Secret variables need Azure Key Vault and are set in the maker portal.")]
    public EnvVarType? Type { get; init; }

    public string? DefaultValue { get; init; }

    [Description("The current value in this environment.")]
    public string? Value { get; init; }

    public string? Description { get; init; }
}

public sealed class ConnectionReferenceDefinition
{
    [Description("Logical name with the publisher prefix, for example con_sharedoffice365.")]
    public required string LogicalName { get; init; }

    public string? DisplayName { get; init; }

    [Description("The connector, for example shared_office365. Fixed when created.")]
    public required string Connector { get; init; }

    [Description("The connection to use (its name in the maker portal). An agent cannot create connections.")]
    public string? ConnectionId { get; init; }

    public string? Description { get; init; }
}

/// <summary>Plans config_apply: environment variable definitions and their current values, then connection references.</summary>
public sealed class ConfigPlanner : IComponentPlanner<ConfigApplySpec>
{
    public const string Family = "config";
    public const string ConnectionReferenceTable = "connectionreference";

    private static readonly Dictionary<EnvVarType, int> TypeValues = new()
    {
        [EnvVarType.String] = 100000000,
        [EnvVarType.Number] = 100000001,
        [EnvVarType.Boolean] = 100000002,
        [EnvVarType.Json] = 100000003,
        [EnvVarType.DataSource] = 100000004,
    };

    public async Task<Plan> PlanAsync(ConfigApplySpec spec, PlanContext context, CancellationToken ct)
    {
        var solution = await context.SolutionAsync(spec.Solution, ct);
        var client = context.Client;
        var steps = new List<PlanStep>();
        var locks = new List<string>();

        foreach (var variable in spec.EnvironmentVariables ?? [])
        {
            var schema = variable.SchemaName.Trim();
            locks.Add($"envvar:{schema.ToLowerInvariant()}");
            var definition = await FindAsync(client, "environmentvariabledefinition", "schemaname", schema, ct);
            if (definition is null)
            {
                if (solution.CheckSchemaName(schema) is { } problem) throw new AgentProblemException(problem);
                if (string.IsNullOrWhiteSpace(variable.DisplayName)) throw Invalid($"Environment variable {schema} does not exist yet; it needs displayName.");
                var type = variable.Type ?? EnvVarType.String;
                var row = new Entity("environmentvariabledefinition")
                {
                    ["schemaname"] = schema,
                    ["displayname"] = variable.DisplayName,
                    ["type"] = new OptionSetValue(TypeValues[type]),
                };
                if (variable.DefaultValue is not null) row["defaultvalue"] = variable.DefaultValue;
                if (variable.Description is not null) row["description"] = variable.Description;
                steps.Add(new PlanStep
                {
                    Op = "createVariable",
                    Target = schema,
                    Detail = $"{variable.DisplayName}; {type.ToString().ToLowerInvariant()}{(variable.DefaultValue is null ? "" : $"; default {variable.DefaultValue}")}",
                    Request = new CreateRequest { Target = row },
                });
                if (variable.Value is not null) steps.Add(SetValue(schema, null, null, variable.Value));
                continue;
            }

            var changes = new List<string>();
            var update = new Entity("environmentvariabledefinition", definition.Id);
            Compare(definition, update, changes, "displayname", variable.DisplayName, "name");
            Compare(definition, update, changes, "defaultvalue", variable.DefaultValue, "default");
            Compare(definition, update, changes, "description", variable.Description, "description");
            var currentType = definition.GetAttributeValue<OptionSetValue>("type")?.Value;
            if (variable.Type is { } wantedType && currentType != TypeValues[wantedType])
                steps.Add(PlanStep.Blocked("updateVariable", schema, $"The type of {schema} cannot change after it is created."));
            if (changes.Count > 0)
            {
                steps.Add(definition.GetAttributeValue<BooleanManagedProperty>("iscustomizable")?.Value == false
                    ? PlanStep.Blocked("updateVariable", schema, $"{schema} is managed and not customizable; only its value can be set.")
                    : new PlanStep { Op = "updateVariable", Target = schema, Detail = string.Join("; ", changes), Request = new UpdateRequest { Target = update } });
            }

            if (variable.Value is null) continue;
            var value = await FindAsync(client, "environmentvariablevalue", "environmentvariabledefinitionid", definition.Id, ct);
            var current = value?.GetAttributeValue<string>("value");
            if (value is not null && current == variable.Value) continue;
            steps.Add(SetValue(schema, definition.Id, value?.Id, variable.Value, current));
        }

        foreach (var reference in spec.ConnectionReferences ?? [])
        {
            var name = reference.LogicalName.Trim().ToLowerInvariant();
            if (!context.Capabilities.HasTable(ConnectionReferenceTable))
            {
                steps.Add(PlanStep.Unsupported("createConnectionReference", name,
                    "This environment has no connection references (they are online only).",
                    "Classic workflows use the connections of the environment instead; import one in a solution with solution_import."));
                continue;
            }

            locks.Add($"connectionreference:{name}");
            var connector = ConnectorId(reference.Connector);
            var row = await FindAsync(client, ConnectionReferenceTable, "connectionreferencelogicalname", name, ct);
            if (row is null)
            {
                if (solution.CheckSchemaName(name) is { } problem) throw new AgentProblemException(problem);
                var entity = new Entity(ConnectionReferenceTable)
                {
                    ["connectionreferencelogicalname"] = name,
                    ["connectionreferencedisplayname"] = reference.DisplayName ?? name,
                    ["connectorid"] = connector,
                };
                if (reference.ConnectionId is not null) entity["connectionid"] = reference.ConnectionId;
                if (reference.Description is not null) entity["description"] = reference.Description;
                steps.Add(new PlanStep
                {
                    Op = "createConnectionReference",
                    Target = name,
                    Detail = $"{reference.DisplayName ?? name}; {connector}{(reference.ConnectionId is null ? "; no connection yet" : $"; connection {reference.ConnectionId}")}",
                    Request = new CreateRequest { Target = entity },
                });
                continue;
            }

            if (!string.Equals(row.GetAttributeValue<string>("connectorid"), connector, StringComparison.OrdinalIgnoreCase))
            {
                steps.Add(PlanStep.Blocked("updateConnectionReference", name, $"{name} uses connector {row.GetAttributeValue<string>("connectorid")}; the connector cannot change."));
                continue;
            }

            var update = new Entity(ConnectionReferenceTable, row.Id);
            var changes = new List<string>();
            Compare(row, update, changes, "connectionreferencedisplayname", reference.DisplayName, "name");
            Compare(row, update, changes, "connectionid", reference.ConnectionId, "connection");
            Compare(row, update, changes, "description", reference.Description, "description");
            if (changes.Count > 0)
                steps.Add(new PlanStep { Op = "updateConnectionReference", Target = name, Detail = string.Join("; ", changes), Request = new UpdateRequest { Target = update } });
        }

        return new Plan(steps, lockKeys: locks);
    }

    /// <summary>"shared_office365" becomes the connector id Dataverse stores.</summary>
    public static string ConnectorId(string connector) =>
        connector.Trim().StartsWith('/') ? connector.Trim() : $"/providers/Microsoft.PowerApps/apis/{connector.Trim()}";

    /// <summary>Sets the current value. The definition may be created by an earlier step, so it is found when the step runs.</summary>
    private static PlanStep SetValue(string schema, Guid? definitionId, Guid? valueId, string value, string? current = null) => new()
    {
        Op = valueId is null ? "createValue" : "updateValue",
        Target = schema,
        Detail = valueId is null ? $"value {value}" : $"value {current} → {value}",
        SolutionAware = false,
        Action = async (step, token) =>
        {
            if (valueId is { } existing)
            {
                await step.Client.UpdateAsync(new Entity("environmentvariablevalue", existing) { ["value"] = value }, token);
                return;
            }

            var definition = definitionId ?? (await FindAsync(step.Client, "environmentvariabledefinition", "schemaname", schema, token))?.Id
                ?? throw Invalid($"Environment variable {schema} was not found.");
            var created = await step.Client.CreateAsync(new Entity("environmentvariablevalue")
            {
                ["schemaname"] = $"{schema}_value",
                ["value"] = value,
                ["environmentvariabledefinitionid"] = new EntityReference("environmentvariabledefinition", definition),
            }, token);
            step.Ids.Add(created.ToString("D"));
        },
    };

    private static void Compare(Entity row, Entity update, List<string> changes, string column, string? wanted, string what)
    {
        if (wanted is null || string.Equals(row.GetAttributeValue<string>(column) ?? "", wanted, StringComparison.Ordinal)) return;
        update[column] = wanted;
        changes.Add($"{what} {row.GetAttributeValue<string>(column)} → {wanted}");
    }

    private static async Task<Entity?> FindAsync(IAgentClient client, string table, string column, object value, CancellationToken ct)
    {
        var query = new QueryExpression(table) { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet(true) };
        query.Criteria.AddCondition(column, ConditionOperator.Equal, value);
        return (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault();
    }

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
