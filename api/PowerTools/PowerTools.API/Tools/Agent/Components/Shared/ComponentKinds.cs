using System.ComponentModel;
using System.Text.Json.Serialization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.Agent.Kernel;

namespace PowerTools.API.Tools.Agent.Components.Shared;

/// <summary>The components an agent names by kind: the targets of remove and the components solution_apply adds.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ComponentKind>))]
public enum ComponentKind
{
    [JsonStringEnumMemberName("table")] Table,
    [JsonStringEnumMemberName("column")] Column,
    [JsonStringEnumMemberName("relationship")] Relationship,
    [JsonStringEnumMemberName("key")] Key,
    [JsonStringEnumMemberName("choice")] Choice,
    [JsonStringEnumMemberName("form")] Form,
    [JsonStringEnumMemberName("view")] View,
    [JsonStringEnumMemberName("app")] App,
    [JsonStringEnumMemberName("sitemap")] SiteMap,
    [JsonStringEnumMemberName("webresource")] WebResource,
    [JsonStringEnumMemberName("command")] Command,
    [JsonStringEnumMemberName("process")] Process,
    [JsonStringEnumMemberName("flow")] Flow,
    [JsonStringEnumMemberName("customapi")] CustomApi,
    [JsonStringEnumMemberName("pluginassembly")] PluginAssembly,
    [JsonStringEnumMemberName("plugintype")] PluginType,
    [JsonStringEnumMemberName("pluginstep")] PluginStep,
    [JsonStringEnumMemberName("pluginimage")] PluginImage,
    [JsonStringEnumMemberName("role")] Role,
    [JsonStringEnumMemberName("envvar")] EnvVar,
    [JsonStringEnumMemberName("connectionreference")] ConnectionReference,
}

/// <summary>A component found in the environment.</summary>
/// <param name="ComponentType">The solution component type, or 0 when the component is not one.</param>
/// <param name="RecordTable">For components stored as rows: the table of the row.</param>
public sealed record FoundComponent(
    ComponentKind Kind,
    string Label,
    int ComponentType,
    Guid Id,
    bool Managed,
    bool Customizable,
    string? RecordTable = null,
    Entity? Row = null);

/// <summary>
/// Finds components by kind and name with SDK messages and queries only, so one path serves online and on-premises.
/// Tables, columns, relationships, keys and global choices are metadata; everything else is a row.
/// </summary>
public static class ComponentKinds
{
    public const int EntityType = 1;
    public const int AttributeType = 2;
    public const int OptionSetType = 9;
    public const int RelationshipType = 10;
    public const int EntityKeyType = 14;
    public const int RoleType = 20;
    public const int WorkflowType = 29;
    public const int SavedQueryType = 26;
    public const int SystemFormType = 60;
    public const int WebResourceType = 61;
    public const int SiteMapType = 62;
    public const int AppModuleType = 80;
    public const int PluginTypeType = 90;
    public const int PluginAssemblyType = 91;
    public const int StepType = 92;
    public const int StepImageType = 93;
    public const int EnvVarDefinitionType = 380;

    /// <summary>Row-based kinds: table, name column, the classic component type (0: look it up), and a feature table.</summary>
    private sealed record RowKind(string Table, string NameColumn, int ComponentType, string? Feature = null);

    private static readonly Dictionary<ComponentKind, RowKind> Rows = new()
    {
        [ComponentKind.Form] = new("systemform", "name", SystemFormType),
        [ComponentKind.View] = new("savedquery", "name", SavedQueryType),
        [ComponentKind.App] = new("appmodule", "uniquename", AppModuleType),
        [ComponentKind.SiteMap] = new("sitemap", "sitemapnameunique", SiteMapType),
        [ComponentKind.WebResource] = new("webresource", "name", WebResourceType),
        [ComponentKind.Command] = new("appaction", "uniquename", 0, "appaction"),
        [ComponentKind.Process] = new("workflow", "name", WorkflowType),
        [ComponentKind.Flow] = new("workflow", "name", WorkflowType),
        [ComponentKind.CustomApi] = new("customapi", "uniquename", 0, "customapi"),
        [ComponentKind.PluginAssembly] = new("pluginassembly", "name", PluginAssemblyType),
        [ComponentKind.PluginType] = new("plugintype", "typename", PluginTypeType),
        [ComponentKind.PluginStep] = new("sdkmessageprocessingstep", "name", StepType),
        [ComponentKind.PluginImage] = new("sdkmessageprocessingstepimage", "name", StepImageType),
        [ComponentKind.Role] = new("role", "name", RoleType),
        [ComponentKind.EnvVar] = new("environmentvariabledefinition", "schemaname", EnvVarDefinitionType),
        [ComponentKind.ConnectionReference] = new("connectionreference", "connectionreferencelogicalname", 0, "connectionreference"),
    };

    public static string Name(ComponentKind kind) =>
        JsonNamingPolicy(kind);

    private static string JsonNamingPolicy(ComponentKind kind) =>
        typeof(ComponentKind).GetField(kind.ToString())!
            .GetCustomAttributes(typeof(JsonStringEnumMemberNameAttribute), false)
            .OfType<JsonStringEnumMemberNameAttribute>().Single().Name;

    /// <summary>Kinds that need table to be found.</summary>
    public static bool NeedsTable(ComponentKind kind) => kind is ComponentKind.Column or ComponentKind.Key or ComponentKind.Form or ComponentKind.View;

    /// <summary>The feature table a kind needs, or null when every environment has it.</summary>
    public static string? Feature(ComponentKind kind) => Rows.TryGetValue(kind, out var row) ? row.Feature : null;

    /// <summary>The table rows of a kind are stored in, or null for metadata kinds.</summary>
    public static string? RowTable(ComponentKind kind) => Rows.TryGetValue(kind, out var row) ? row.Table : null;

    /// <summary>Finds one component, or answers null when it does not exist. Several rows with the name is a bad request.</summary>
    public static async Task<FoundComponent?> FindAsync(
        IAgentClient client, ComponentKind kind, string name, string? table, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name)) throw Invalid($"A {Name(kind)} needs its name.");
        if (NeedsTable(kind) && string.IsNullOrWhiteSpace(table)) throw Invalid($"A {Name(kind)} needs table.");
        name = name.Trim();
        var logicalTable = table?.Trim().ToLowerInvariant();

        switch (kind)
        {
            case ComponentKind.Table:
                return await Metadata(async () =>
                {
                    var table1 = ((RetrieveEntityResponse)await client.ExecuteAsync(
                        new RetrieveEntityRequest { LogicalName = name.ToLowerInvariant(), EntityFilters = EntityFilters.Entity, RetrieveAsIfPublished = true }, ct)).EntityMetadata;
                    return Found(kind, table1.LogicalName, EntityType, table1.MetadataId, table1.IsManaged, table1.IsCustomizable?.Value);
                });
            case ComponentKind.Column:
                return await Metadata(async () =>
                {
                    var column = ((RetrieveAttributeResponse)await client.ExecuteAsync(
                        new RetrieveAttributeRequest { EntityLogicalName = logicalTable, LogicalName = name.ToLowerInvariant(), RetrieveAsIfPublished = true }, ct)).AttributeMetadata;
                    return Found(kind, $"{logicalTable}.{column.LogicalName}", AttributeType, column.MetadataId, column.IsManaged, column.IsCustomizable?.Value);
                });
            case ComponentKind.Relationship:
                return await Metadata(async () =>
                {
                    var relationship = ((RetrieveRelationshipResponse)await client.ExecuteAsync(
                        new RetrieveRelationshipRequest { Name = name, RetrieveAsIfPublished = true }, ct)).RelationshipMetadata;
                    return Found(kind, relationship.SchemaName, RelationshipType, relationship.MetadataId, relationship.IsManaged, relationship.IsCustomizable?.Value);
                });
            case ComponentKind.Key:
                return await Metadata(async () =>
                {
                    var key = ((RetrieveEntityKeyResponse)await client.ExecuteAsync(
                        new RetrieveEntityKeyRequest { EntityLogicalName = logicalTable, LogicalName = name.ToLowerInvariant() }, ct)).EntityKeyMetadata;
                    return Found(kind, $"{logicalTable}.{key.LogicalName}", EntityKeyType, key.MetadataId, key.IsManaged, key.IsCustomizable?.Value);
                });
            case ComponentKind.Choice:
                return await Metadata(async () =>
                {
                    var choice = ((RetrieveOptionSetResponse)await client.ExecuteAsync(
                        new RetrieveOptionSetRequest { Name = name.ToLowerInvariant(), RetrieveAsIfPublished = true }, ct)).OptionSetMetadata;
                    return Found(kind, choice.Name, OptionSetType, choice.MetadataId, choice.IsManaged, choice.IsCustomizable?.Value);
                });
        }

        var rowKind = Rows[kind];
        var query = new QueryExpression(rowKind.Table) { NoLock = true, TopCount = 2, ColumnSet = new ColumnSet(true) };
        if (Guid.TryParse(name, out var id)) query.Criteria.AddCondition(IdColumn(rowKind.Table), ConditionOperator.Equal, id);
        else query.Criteria.AddCondition(rowKind.NameColumn, ConditionOperator.Equal, name);
        switch (kind)
        {
            case ComponentKind.Form:
                query.Criteria.AddCondition("objecttypecode", ConditionOperator.Equal, logicalTable);
                break;
            case ComponentKind.View:
                query.Criteria.AddCondition("returnedtypecode", ConditionOperator.Equal, logicalTable);
                break;
            case ComponentKind.Process:
                query.Criteria.AddCondition("type", ConditionOperator.Equal, 1);
                query.Criteria.AddCondition("category", ConditionOperator.NotEqual, FlowCategory);
                break;
            case ComponentKind.Flow:
                query.Criteria.AddCondition("type", ConditionOperator.Equal, 1);
                query.Criteria.AddCondition("category", ConditionOperator.Equal, FlowCategory);
                break;
            case ComponentKind.Role:
                query.Criteria.AddCondition("parentroleid", ConditionOperator.Null);
                break;
        }

        var rows = (await client.RetrieveMultipleAsync(query, ct)).Entities;
        if (rows.Count == 0) return null;
        if (rows.Count > 1) throw Invalid($"More than one {Name(kind)} is named '{name}'. Give its id instead.");
        var row = rows[0];
        var type = rowKind.ComponentType != 0 ? rowKind.ComponentType : await ComponentTypeOfTableAsync(client, rowKind.Table, ct);
        var customizable = row.GetAttributeValue<BooleanManagedProperty>("iscustomizable")?.Value;
        var label = NeedsTable(kind) ? $"{logicalTable}/{row.GetAttributeValue<string>(rowKind.NameColumn)}" : row.GetAttributeValue<string>(rowKind.NameColumn) ?? name;
        return new FoundComponent(kind, label, type, row.Id, row.GetAttributeValue<bool?>("ismanaged") == true, customizable ?? true, rowKind.Table, row);
    }

    /// <summary>Category of cloud flows in the workflow table.</summary>
    public const int FlowCategory = 5;

    /// <summary>The primary key column of a table. systemform is the one table whose key is not its name plus "id".</summary>
    public static string IdColumn(string table) => table == "systemform" ? "formid" : $"{table}id";

    /// <summary>
    /// The component type of a solution-aware table that has no classic number (such as customapi), from
    /// solutioncomponentdefinition, where it differs between environments. 0 when it is not found.
    /// </summary>
    public static async Task<int> ComponentTypeOfTableAsync(IAgentClient client, string table, CancellationToken ct)
    {
        try
        {
            var query = new QueryExpression("solutioncomponentdefinition") { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet("solutioncomponenttype") };
            query.Criteria.AddCondition("primaryentityname", ConditionOperator.Equal, table);
            var row = (await client.RetrieveMultipleAsync(query, ct)).Entities.FirstOrDefault();
            return row?.GetAttributeValue<int?>("solutioncomponenttype") ?? row?.GetAttributeValue<OptionSetValue>("solutioncomponenttype")?.Value ?? 0;
        }
        catch (Exception ex) when (RetryPolicy.FindFault(ex) is { } fault && !RetryPolicy.ServiceProtectionCodes.Contains(fault.ErrorCode))
        {
            return 0;
        }
    }

    /// <summary>True when the solution holds the component.</summary>
    public static async Task<bool> InSolutionAsync(IAgentClient client, Guid solutionId, Guid componentId, CancellationToken ct)
    {
        var query = new QueryExpression("solutioncomponent") { NoLock = true, TopCount = 1, ColumnSet = new ColumnSet("objectid") };
        query.Criteria.AddCondition("solutionid", ConditionOperator.Equal, solutionId);
        query.Criteria.AddCondition("objectid", ConditionOperator.Equal, componentId);
        return (await client.RetrieveMultipleAsync(query, ct)).Entities.Count > 0;
    }

    private static FoundComponent? Found(ComponentKind kind, string label, int type, Guid? id, bool? managed, bool? customizable) =>
        new(kind, label, type, id ?? Guid.Empty, managed == true, customizable ?? true);

    /// <summary>A metadata read; a fault other than throttling means the component does not exist.</summary>
    private static async Task<FoundComponent?> Metadata(Func<Task<FoundComponent?>> read)
    {
        try
        {
            return await read();
        }
        catch (Exception ex) when (RetryPolicy.FindFault(ex) is { } fault && !RetryPolicy.ServiceProtectionCodes.Contains(fault.ErrorCode))
        {
            return null;
        }
    }

    internal static AgentProblemException Invalid(string message) => new(AgentFaults.InvalidRequest(message));
}

/// <summary>A component named by kind, as specs give it.</summary>
public sealed class ComponentReference
{
    public required ComponentKind Kind { get; init; }

    [Description("Logical name, unique name or schema name (by kind), or the id.")]
    public required string Name { get; init; }

    [Description("Table logical name, for column, key, form and view.")]
    public string? Table { get; init; }
}
