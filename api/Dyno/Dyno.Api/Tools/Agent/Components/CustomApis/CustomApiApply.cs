using System.ComponentModel;
using System.Text.Json.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Dyno.Api.Tools.Agent.Components.Shared;
using Dyno.Api.Tools.Agent.Kernel;

namespace Dyno.Api.Tools.Agent.Components.CustomApis;

[JsonConverter(typeof(JsonStringEnumConverter<CustomApiBinding>))]
public enum CustomApiBinding
{
    [JsonStringEnumMemberName("global")] Global,
    [JsonStringEnumMemberName("entity")] Entity,
    [JsonStringEnumMemberName("entityCollection")] EntityCollection,
}

[JsonConverter(typeof(JsonStringEnumConverter<CustomApiStepType>))]
public enum CustomApiStepType
{
    [JsonStringEnumMemberName("none")] None,
    [JsonStringEnumMemberName("asyncOnly")] AsyncOnly,
    [JsonStringEnumMemberName("syncAndAsync")] SyncAndAsync,
}

[JsonConverter(typeof(JsonStringEnumConverter<CustomApiType>))]
public enum CustomApiType
{
    [JsonStringEnumMemberName("boolean")] Boolean,
    [JsonStringEnumMemberName("dateTime")] DateTime,
    [JsonStringEnumMemberName("decimal")] Decimal,
    [JsonStringEnumMemberName("entity")] Entity,
    [JsonStringEnumMemberName("entityCollection")] EntityCollection,
    [JsonStringEnumMemberName("entityReference")] EntityReference,
    [JsonStringEnumMemberName("float")] Float,
    [JsonStringEnumMemberName("integer")] Integer,
    [JsonStringEnumMemberName("money")] Money,
    [JsonStringEnumMemberName("picklist")] Picklist,
    [JsonStringEnumMemberName("string")] String,
    [JsonStringEnumMemberName("stringArray")] StringArray,
    [JsonStringEnumMemberName("guid")] Guid,
}

[Description("A Custom API, its request parameters and response properties. Leave a property out to keep it. Parameters and properties left out are kept.")]
public sealed class CustomApiApplySpec : IApplySpec
{
    [Description("Unique name of the unmanaged solution the API goes into. Its publisher decides the prefix.")]
    public required string Solution { get; init; }

    [Description("The message name, with the publisher prefix, for example con_CloseProject. Cannot change.")]
    public required string UniqueName { get; init; }

    [Description("Default: the unique name.")]
    public string? DisplayName { get; init; }

    public string? Description { get; init; }

    [Description("Default global. Changing it recreates the API.")]
    public CustomApiBinding? Binding { get; init; }

    [Description("Table logical name, for binding entity or entityCollection. Changing it recreates the API.")]
    public string? BoundTable { get; init; }

    [Description("A function (GET in the Web API) instead of an action. Default false. Changing it recreates the API.")]
    public bool? IsFunction { get; init; }

    [Description("Default false.")]
    public bool? IsPrivate { get; init; }

    [Description("Which plug-in steps others may register on the message. Default none. Changing it recreates the API.")]
    public CustomApiStepType? StepType { get; init; }

    [Description("Usable as a classic workflow step. Default false. Changing it recreates the API.")]
    public bool? WorkflowEnabled { get; init; }

    [Description("Name of a privilege a caller needs, for example prvReadcon_project.")]
    public string? ExecutePrivilege { get; init; }

    [Description("Full type name of the registered plug-in type that runs the API. Deploy it with plugin_deploy first.")]
    public string? PluginType { get; init; }

    public List<CustomApiField>? RequestParameters { get; init; }

    public List<CustomApiField>? ResponseProperties { get; init; }
}

[Description("A request parameter or response property. uniqueName, type, table and optional cannot change: changing one recreates it.")]
public sealed class CustomApiField
{
    [Description("The name callers use, for example Reason.")]
    public required string UniqueName { get; init; }

    public required CustomApiType Type { get; init; }

    [Description("Table logical name, for entity and entityReference.")]
    public string? Table { get; init; }

    [Description("Request parameters only. Default false.")]
    public bool? Optional { get; init; }

    [Description("Default: the unique name.")]
    public string? DisplayName { get; init; }

    public string? Description { get; init; }
}

/// <summary>
/// Plans customapi_apply. Columns Dataverse fixes when a Custom API, parameter or property is saved (unique name,
/// binding, bound table, function, step type, workflow; a field's type, table and optional) cannot be updated, so a
/// change to one plans a destructive delete and a create.
/// </summary>
public sealed class CustomApiPlanner : IComponentPlanner<CustomApiApplySpec>
{
    public const string Family = "customapi";

    private const string ParameterTable = "customapirequestparameter";

    private const string PropertyTable = "customapiresponseproperty";

    public async Task<Plan> PlanAsync(CustomApiApplySpec spec, PlanContext context, CancellationToken ct)
    {
        var uniqueName = spec.UniqueName?.Trim() ?? "";
        if (uniqueName.Length == 0) throw Invalid("uniqueName is required.");
        if (!context.Capabilities.HasTable("customapi"))
        {
            return new Plan([PlanStep.Unsupported("createCustomApi", uniqueName,
                "This environment has no Custom APIs.",
                "Define the message as a custom process action with process_apply (kind action).")]);
        }

        var solution = await context.SolutionAsync(spec.Solution, ct);
        if (!System.Text.RegularExpressions.Regex.IsMatch(uniqueName, "^[A-Za-z0-9_]+$")) throw Invalid("uniqueName may only hold letters, digits and _.");
        Check(spec);
        var boundTable = spec.BoundTable?.Trim().ToLowerInvariant();
        if (boundTable is not null && await context.Metadata.TableAsync(boundTable, ct) is null) throw Invalid($"Table {boundTable} does not exist.");
        foreach (var field in Fields(spec))
        {
            if (field.Table is { } table && await context.Metadata.TableAsync(table.Trim().ToLowerInvariant(), ct) is null)
                throw Invalid($"{field.UniqueName}: table {table} does not exist.");
        }

        var pluginType = spec.PluginType is null ? (Guid?)null : await PluginTypeAsync(context.Client, spec.PluginType, ct);
        var current = await FindAsync(context.Client, uniqueName, ct);
        var lockKeys = new[] { $"customapi:{uniqueName.ToLowerInvariant()}" };
        var steps = new List<PlanStep>();

        if (current is null)
        {
            if (solution.CheckSchemaName(uniqueName) is { } problem) throw new AgentProblemException(problem);
            AddCreate(steps, spec, Guid.NewGuid(), pluginType, "");
            return new Plan(steps, lockKeys: lockKeys);
        }

        if (current.GetAttributeValue<BooleanManagedProperty>("iscustomizable")?.Value == false)
            return new Plan([PlanStep.Blocked("updateCustomApi", uniqueName, $"Custom API {uniqueName} is managed and not customizable.")], lockKeys: lockKeys);

        var fixedChanges = FixedChanges(spec, current, boundTable);
        if (fixedChanges.Count > 0)
        {
            var id = current.Id;
            var parameters = await CurrentFieldsAsync(context.Client, ParameterTable, id, ct);
            var properties = await CurrentFieldsAsync(context.Client, PropertyTable, id, ct);
            var merged = Merged(spec, current, parameters, properties);
            var carried = merged.RequestParameters!.Concat(merged.ResponseProperties!)
                .Where(f => !Fields(spec).Any(w => string.Equals(w.UniqueName.Trim(), f.UniqueName, StringComparison.Ordinal)))
                .Select(f => f.UniqueName)
                .ToList();
            steps.Add(new PlanStep
            {
                Op = "deleteCustomApi",
                Target = uniqueName,
                Effect = PlanEffect.Destructive,
                Detail = $"{string.Join("; ", fixedChanges)} cannot change once saved, so the API is deleted and created again. "
                    + "The plug-in steps registered on it are deleted with it and are not registered again."
                    + (carried.Count == 0 ? "" : $" Parameters and properties the spec leaves out are created again as they are: {string.Join(", ", carried)}."),
                Request = new DeleteRequest { Target = new EntityReference("customapi", id) },
                SolutionAware = false,
            });
            AddCreate(steps, merged, Guid.NewGuid(), pluginType ?? current.GetAttributeValue<EntityReference>("plugintypeid")?.Id, " (again)");
            return new Plan(steps, lockKeys: lockKeys);
        }

        var update = new Entity("customapi", current.Id);
        var changes = new List<string>();
        void Set(string column, object? wanted, object? now, string label)
        {
            if (wanted is null || Equals(wanted, now)) return;
            update[column] = wanted;
            changes.Add(label);
        }

        Set("displayname", spec.DisplayName, current.GetAttributeValue<string>("displayname"), $"display name → {spec.DisplayName}");
        Set("description", spec.Description, current.GetAttributeValue<string>("description"), "description");
        Set("isprivate", spec.IsPrivate, current.GetAttributeValue<bool?>("isprivate") ?? false, $"private → {spec.IsPrivate}");
        Set("executeprivilegename", spec.ExecutePrivilege, current.GetAttributeValue<string>("executeprivilegename"), $"execute privilege → {spec.ExecutePrivilege}");
        if (pluginType is { } typeId && current.GetAttributeValue<EntityReference>("plugintypeid")?.Id != typeId)
        {
            update["plugintypeid"] = new EntityReference("plugintype", typeId);
            changes.Add($"plug-in type → {spec.PluginType}");
        }

        if (changes.Count > 0)
        {
            var apiId = current.Id;
            steps.Add(new PlanStep
            {
                Op = "updateCustomApi",
                Target = uniqueName,
                Detail = string.Join("; ", changes),
                Action = async (step, token) =>
                {
                    await step.Client.UpdateAsync(update, token);
                    await AddToSolutionAsync(step, "customapi", apiId, token);
                },
            });
        }

        var warnings = new List<string>();
        await PlanFieldsAsync(context.Client, steps, warnings, current.Id, uniqueName, ParameterTable, spec.RequestParameters, ct);
        await PlanFieldsAsync(context.Client, steps, warnings, current.Id, uniqueName, PropertyTable, spec.ResponseProperties, ct);
        return new Plan(steps, warnings, lockKeys);
    }

    private static void AddCreate(List<PlanStep> steps, CustomApiApplySpec spec, Guid id, Guid? pluginType, string again)
    {
        var uniqueName = spec.UniqueName.Trim();
        var api = new Entity("customapi", id)
        {
            ["uniquename"] = uniqueName,
            ["name"] = uniqueName,
            ["displayname"] = spec.DisplayName ?? uniqueName,
            ["bindingtype"] = new OptionSetValue((int)(spec.Binding ?? CustomApiBinding.Global)),
            ["isfunction"] = spec.IsFunction ?? false,
            ["isprivate"] = spec.IsPrivate ?? false,
            ["allowedcustomprocessingsteptype"] = new OptionSetValue((int)(spec.StepType ?? CustomApiStepType.None)),
            ["workflowsdkstepenabled"] = spec.WorkflowEnabled ?? false,
        };
        if (spec.BoundTable is { } bound) api["boundentitylogicalname"] = bound.Trim().ToLowerInvariant();
        if (spec.Description is not null) api["description"] = spec.Description;
        if (spec.ExecutePrivilege is not null) api["executeprivilegename"] = spec.ExecutePrivilege;
        if (pluginType is { } type) api["plugintypeid"] = new EntityReference("plugintype", type);
        steps.Add(new PlanStep
        {
            Op = "createCustomApi",
            Target = uniqueName,
            Detail = $"{(spec.IsFunction == true ? "function" : "action")}, binding {spec.Binding ?? CustomApiBinding.Global}{(spec.BoundTable is null ? "" : $" {spec.BoundTable}")}, steps {spec.StepType ?? CustomApiStepType.None}{(spec.PluginType is null ? "" : $", plug-in {spec.PluginType}")}{again}",
            Request = new CreateRequest { Target = api },
        });
        foreach (var field in spec.RequestParameters ?? []) steps.Add(CreateField(ParameterTable, id, uniqueName, field));
        foreach (var field in spec.ResponseProperties ?? []) steps.Add(CreateField(PropertyTable, id, uniqueName, field));
    }

    private static PlanStep CreateField(string table, Guid apiId, string api, CustomApiField field)
    {
        var name = field.UniqueName.Trim();
        var row = new Entity(table)
        {
            ["uniquename"] = name,
            ["name"] = $"{api}.{name}",
            ["displayname"] = field.DisplayName ?? name,
            ["type"] = new OptionSetValue((int)field.Type),
            ["customapiid"] = new EntityReference("customapi", apiId),
        };
        if (field.Table is { } logical) row["logicalentityname"] = logical.Trim().ToLowerInvariant();
        if (field.Description is not null) row["description"] = field.Description;
        if (table == ParameterTable) row["isoptional"] = field.Optional ?? false;
        return new PlanStep
        {
            Op = table == ParameterTable ? "createParameter" : "createProperty",
            Target = $"{api}.{name}",
            Detail = $"{Name(field.Type)}{(field.Table is null ? "" : $" {field.Table}")}{(table == ParameterTable && field.Optional == true ? ", optional" : "")}",
            Request = new CreateRequest { Target = row },
        };
    }

    private static async Task PlanFieldsAsync(
        IAgentClient client, List<PlanStep> steps, List<string> warnings, Guid apiId, string api, string table, List<CustomApiField>? wanted, CancellationToken ct)
    {
        var query = new QueryExpression(table) { NoLock = true, ColumnSet = new ColumnSet(true) };
        query.Criteria.AddCondition("customapiid", ConditionOperator.Equal, apiId);
        var current = (await client.RetrieveMultipleAsync(query, ct)).Entities.ToList();
        var parameter = table == ParameterTable;
        var what = parameter ? "parameter" : "property";
        foreach (var field in wanted ?? [])
        {
            var name = field.UniqueName.Trim();
            var row = current.FirstOrDefault(r => string.Equals(r.GetAttributeValue<string>("uniquename"), name, StringComparison.Ordinal));
            if (row is null)
            {
                steps.Add(CreateField(table, apiId, api, field));
                continue;
            }

            var fixedChanges = new List<string>();
            var type = row.GetAttributeValue<OptionSetValue>("type")?.Value;
            if (type != (int)field.Type) fixedChanges.Add($"type {(type is { } t ? Name((CustomApiType)t) : "none")} → {Name(field.Type)}");
            var logical = row.GetAttributeValue<string>("logicalentityname");
            var wantedTable = field.Table?.Trim().ToLowerInvariant();
            if (!string.Equals(logical ?? "", wantedTable ?? "", StringComparison.OrdinalIgnoreCase)) fixedChanges.Add($"table {logical ?? "none"} → {wantedTable ?? "none"}");
            if (parameter && field.Optional is { } optional && (row.GetAttributeValue<bool?>("isoptional") ?? false) != optional) fixedChanges.Add($"optional → {optional}");
            if (fixedChanges.Count > 0)
            {
                steps.Add(new PlanStep
                {
                    Op = parameter ? "deleteParameter" : "deleteProperty",
                    Target = $"{api}.{name}",
                    Effect = PlanEffect.Destructive,
                    Detail = $"{string.Join("; ", fixedChanges)} cannot change once saved, so the {what} is deleted and created again.",
                    Request = new DeleteRequest { Target = new EntityReference(table, row.Id) },
                    SolutionAware = false,
                });
                steps.Add(CreateField(table, apiId, api, field.Optional is null && parameter ? WithOptional(field, row.GetAttributeValue<bool?>("isoptional") ?? false) : field));
                continue;
            }

            var update = new Entity(table, row.Id);
            var changes = new List<string>();
            if (field.DisplayName is { } display && display != row.GetAttributeValue<string>("displayname"))
            {
                update["displayname"] = display;
                changes.Add($"display name → {display}");
            }

            if (field.Description is { } description && description != row.GetAttributeValue<string>("description"))
            {
                update["description"] = description;
                changes.Add("description");
            }

            if (changes.Count == 0) continue;
            steps.Add(new PlanStep
            {
                Op = parameter ? "updateParameter" : "updateProperty",
                Target = $"{api}.{name}",
                Detail = string.Join("; ", changes),
                Request = new UpdateRequest { Target = update },
                SolutionAware = false,
            });
        }

        var kept = current
            .Select(r => r.GetAttributeValue<string>("uniquename"))
            .Where(n => wanted is not null && !wanted.Any(f => string.Equals(f.UniqueName.Trim(), n, StringComparison.Ordinal)))
            .ToList();
        if (kept.Count > 0) warnings.Add($"Kept {what}(s) the spec leaves out: {string.Join(", ", kept)}. No tool deletes one of them; to drop one, remove the whole API with remove kind customapi and apply it again.");
    }

    private static CustomApiField WithOptional(CustomApiField field, bool optional) => new()
    {
        UniqueName = field.UniqueName,
        Type = field.Type,
        Table = field.Table,
        Optional = optional,
        DisplayName = field.DisplayName,
        Description = field.Description,
    };

    /// <summary>The columns fixed at creation that the spec gives another value.</summary>
    private static List<string> FixedChanges(CustomApiApplySpec spec, Entity current, string? boundTable)
    {
        var changes = new List<string>();
        var binding = current.GetAttributeValue<OptionSetValue>("bindingtype")?.Value ?? 0;
        if (spec.Binding is { } wantedBinding && (int)wantedBinding != binding) changes.Add($"binding {(CustomApiBinding)binding} → {wantedBinding}");
        if (boundTable is not null && !string.Equals(current.GetAttributeValue<string>("boundentitylogicalname"), boundTable, StringComparison.OrdinalIgnoreCase))
            changes.Add($"bound table {current.GetAttributeValue<string>("boundentitylogicalname") ?? "none"} → {boundTable}");
        if (spec.IsFunction is { } function && function != (current.GetAttributeValue<bool?>("isfunction") ?? false)) changes.Add($"function → {function}");
        var stepType = current.GetAttributeValue<OptionSetValue>("allowedcustomprocessingsteptype")?.Value ?? 0;
        if (spec.StepType is { } wantedStep && (int)wantedStep != stepType) changes.Add($"step type {(CustomApiStepType)stepType} → {wantedStep}");
        if (spec.WorkflowEnabled is { } workflow && workflow != (current.GetAttributeValue<bool?>("workflowsdkstepenabled") ?? false)) changes.Add($"workflow → {workflow}");
        return changes;
    }

    private static async Task<List<CustomApiField>> CurrentFieldsAsync(IAgentClient client, string table, Guid apiId, CancellationToken ct)
    {
        var query = new QueryExpression(table) { NoLock = true, ColumnSet = new ColumnSet(true) };
        query.Criteria.AddCondition("customapiid", ConditionOperator.Equal, apiId);
        return (await client.RetrieveMultipleAsync(query, ct)).Entities
            .Select(r => new CustomApiField
            {
                UniqueName = r.GetAttributeValue<string>("uniquename"),
                Type = (CustomApiType)(r.GetAttributeValue<OptionSetValue>("type")?.Value ?? 0),
                Table = r.GetAttributeValue<string>("logicalentityname"),
                Optional = table == ParameterTable ? r.GetAttributeValue<bool?>("isoptional") ?? false : null,
                DisplayName = r.GetAttributeValue<string>("displayname"),
                Description = r.GetAttributeValue<string>("description"),
            })
            .OrderBy(f => f.UniqueName, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>The spec's fields, then the current ones it leaves out, so creating the API again loses none of them.</summary>
    private static List<CustomApiField> Keep(List<CustomApiField>? wanted, List<CustomApiField> current) =>
        [.. wanted ?? [], .. current.Where(c => !(wanted ?? []).Any(w => string.Equals(w.UniqueName.Trim(), c.UniqueName, StringComparison.Ordinal)))];

    /// <summary>The spec with what it leaves out taken from the current API, for creating it again.</summary>
    private static CustomApiApplySpec Merged(CustomApiApplySpec spec, Entity current, List<CustomApiField> parameters, List<CustomApiField> properties) => new()
    {
        Solution = spec.Solution,
        UniqueName = spec.UniqueName,
        DisplayName = spec.DisplayName ?? current.GetAttributeValue<string>("displayname"),
        Description = spec.Description ?? current.GetAttributeValue<string>("description"),
        Binding = spec.Binding ?? (CustomApiBinding)(current.GetAttributeValue<OptionSetValue>("bindingtype")?.Value ?? 0),
        BoundTable = spec.BoundTable ?? current.GetAttributeValue<string>("boundentitylogicalname"),
        IsFunction = spec.IsFunction ?? current.GetAttributeValue<bool?>("isfunction"),
        IsPrivate = spec.IsPrivate ?? current.GetAttributeValue<bool?>("isprivate"),
        StepType = spec.StepType ?? (CustomApiStepType)(current.GetAttributeValue<OptionSetValue>("allowedcustomprocessingsteptype")?.Value ?? 0),
        WorkflowEnabled = spec.WorkflowEnabled ?? current.GetAttributeValue<bool?>("workflowsdkstepenabled"),
        ExecutePrivilege = spec.ExecutePrivilege ?? current.GetAttributeValue<string>("executeprivilegename"),
        PluginType = spec.PluginType,
        RequestParameters = Keep(spec.RequestParameters, parameters),
        ResponseProperties = Keep(spec.ResponseProperties, properties),
    };

    private static void Check(CustomApiApplySpec spec)
    {
        var binding = spec.Binding ?? CustomApiBinding.Global;
        if (binding != CustomApiBinding.Global && string.IsNullOrWhiteSpace(spec.BoundTable)) throw Invalid($"Binding {binding} needs boundTable.");
        if (binding == CustomApiBinding.Global && spec.Binding is not null && spec.BoundTable is not null) throw Invalid("A global Custom API has no boundTable.");
        foreach (var (list, what) in new[] { (spec.RequestParameters, "request parameter"), (spec.ResponseProperties, "response property") })
        {
            var duplicate = (list ?? []).GroupBy(f => f.UniqueName.Trim(), StringComparer.Ordinal).FirstOrDefault(g => g.Count() > 1);
            if (duplicate is not null) throw Invalid($"Two {what}s are named {duplicate.Key}.");
            foreach (var field in list ?? [])
            {
                if (!System.Text.RegularExpressions.Regex.IsMatch(field.UniqueName.Trim(), "^[A-Za-z0-9_]+$")) throw Invalid($"{what} {field.UniqueName}: the name may only hold letters, digits and _.");
                var needsTable = field.Type is CustomApiType.Entity or CustomApiType.EntityReference;
                if (field.Table is not null && !needsTable) throw Invalid($"{what} {field.UniqueName}: only entity and entityReference take table.");
                if (field.Optional is not null && what == "response property") throw Invalid($"Response property {field.UniqueName}: optional is for request parameters.");
            }
        }
    }

    private static IEnumerable<CustomApiField> Fields(CustomApiApplySpec spec) => (spec.RequestParameters ?? []).Concat(spec.ResponseProperties ?? []);

    private static string Name(CustomApiType type) =>
        typeof(CustomApiType).GetField(type.ToString())!.GetCustomAttributes(typeof(JsonStringEnumMemberNameAttribute), false)
            .OfType<JsonStringEnumMemberNameAttribute>().Single().Name;

    internal static async Task<Entity?> FindAsync(IAgentClient client, string uniqueName, CancellationToken ct)
    {
        var query = new QueryExpression("customapi") { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet(true) };
        query.Criteria.AddCondition("uniquename", ConditionOperator.Equal, uniqueName);
        return (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault();
    }

    private static async Task<Guid> PluginTypeAsync(IAgentClient client, string typeName, CancellationToken ct)
    {
        var query = new QueryExpression("plugintype") { NoLock = true, TopCount = 2, ColumnSet = new ColumnSet("typename") };
        if (Guid.TryParse(typeName, out var id)) query.Criteria.AddCondition("plugintypeid", ConditionOperator.Equal, id);
        else query.Criteria.AddCondition("typename", ConditionOperator.Equal, typeName.Trim());
        var rows = (await client.RetrieveMultipleAsync(query, ct)).Entities;
        if (rows.Count == 0) throw Invalid($"There is no plug-in type {typeName}. Deploy its assembly with plugin_deploy first.");
        if (rows.Count > 1) throw Invalid($"More than one plug-in type is named {typeName}; give its id.");
        return rows[0].Id;
    }

    /// <summary>Adds an existing Custom API to the call's solution; its component type differs between environments.</summary>
    private static async Task AddToSolutionAsync(StepContext step, string table, Guid id, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(step.SolutionUniqueName)) return;
        var type = await ComponentKinds.ComponentTypeOfTableAsync(step.Client, table, ct);
        if (type == 0) return;
        await WebResources.WebResourcePlanner.AddToSolutionAsync(step, id, type, ct);
    }

    private static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}
