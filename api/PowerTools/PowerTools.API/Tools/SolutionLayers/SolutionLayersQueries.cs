using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata.Query;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.SolutionLayers;

public static class SolutionLayersLimits
{
    /// <summary>Most components the picker returns for one search.</summary>
    public const int SearchLimit = 50;
    public const int DefinitionPageSize = 5000;
    public static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(5);
}

/// <summary>A normal table the picker searches by name.</summary>
public sealed record ComponentSearchTable(
    string Entity,
    string IdColumn,
    string DisplayColumn,
    string? LogicalColumn,
    string? TableColumn);

public static class SolutionLayersQueries
{
    public const string LayerTable = "msdyn_componentlayer";

    private static readonly Dictionary<int, ComponentSearchTable> Tables = new()
    {
        [ComponentLayerNames.SystemForm] = new("systemform", "formid", "name", null, "objecttypecode"),
        [ComponentLayerNames.SavedQuery] = new("savedquery", "savedqueryid", "name", null, "returnedtypecode"),
        [ComponentLayerNames.SavedQueryVisualization] = new(
            "savedqueryvisualization",
            "savedqueryvisualizationid",
            "name",
            null,
            "primaryentitytypecode"),
        [ComponentLayerNames.WebResource] = new("webresource", "webresourceid", "displayname", "name", null),
        [ComponentLayerNames.Workflow] = new("workflow", "workflowid", "name", "uniquename", "primaryentity"),
        [ComponentLayerNames.Role] = new("role", "roleid", "name", null, null),
        [ComponentLayerNames.PluginAssembly] = new("pluginassembly", "pluginassemblyid", "name", null, null),
        [ComponentLayerNames.SdkMessageProcessingStep] = new(
            "sdkmessageprocessingstep",
            "sdkmessageprocessingstepid",
            "name",
            null,
            null),
        [ComponentLayerNames.CanvasApp] = new("canvasapp", "canvasappid", "displayname", "name", null),
    };

    private static readonly ComponentSearchTable AppModuleTable =
        new(ComponentLayerNames.AppModuleTable, "appmoduleid", "name", "uniquename", null);

    /// <summary>
    /// The layers of one component. msdyn_componentlayer is a virtual table: no paging, no
    /// server-side order, and no NoLock. All columns are read because the documented column
    /// list does not include every column the rows carry (for example the solution version).
    /// </summary>
    public static QueryExpression ComponentLayers(string layerName, Guid componentId)
    {
        var query = new QueryExpression(LayerTable)
        {
            ColumnSet = new ColumnSet(true),
        };
        // msdyn_componentid is a String column, so the id is passed as text.
        query.Criteria.AddCondition("msdyn_componentid", ConditionOperator.Equal, componentId.ToString("D"));
        query.Criteria.AddCondition("msdyn_solutioncomponentname", ConditionOperator.Equal, layerName);
        return query;
    }

    public static QueryExpression Definitions(int pageNumber, string? pagingCookie) =>
        new("solutioncomponentdefinition")
        {
            ColumnSet = new ColumnSet("name", "solutioncomponenttype", "primaryentityname"),
            PageInfo = new PagingInfo
            {
                PageNumber = pageNumber,
                Count = SolutionLayersLimits.DefinitionPageSize,
                PagingCookie = pagingCookie,
            },
            Orders = { new OrderExpression("solutioncomponenttype", OrderType.Ascending) },
        };

    public static ComponentSearchTable? SearchTable(int componentType, int? appModuleType) =>
        Tables.TryGetValue(componentType, out var table)
            ? table
            : appModuleType == componentType ? AppModuleTable : null;

    /// <summary>A name search on a normal table, bounded to one more row than the picker shows.</summary>
    public static QueryExpression Search(int componentType, ComponentSearchTable table, string? search, string? entity)
    {
        var columns = new List<string> { table.IdColumn, table.DisplayColumn };
        if (table.LogicalColumn is not null) columns.Add(table.LogicalColumn);
        if (table.TableColumn is not null) columns.Add(table.TableColumn);

        var query = new QueryExpression(table.Entity)
        {
            ColumnSet = new ColumnSet(columns.Distinct().ToArray()),
            TopCount = SolutionLayersLimits.SearchLimit + 1,
        };

        if (componentType == ComponentLayerNames.Workflow)
            query.Criteria.AddCondition("type", ConditionOperator.Equal, 1);
        if (componentType == ComponentLayerNames.Role)
            query.Criteria.AddCondition("parentroleid", ConditionOperator.Null);

        if (!string.IsNullOrWhiteSpace(entity) && table.TableColumn is not null)
            query.Criteria.AddCondition(table.TableColumn, ConditionOperator.Equal, entity.Trim());

        if (!string.IsNullOrWhiteSpace(search))
        {
            var pattern = $"%{EscapeLike(search.Trim())}%";
            var text = new FilterExpression(LogicalOperator.Or);
            text.AddCondition(table.DisplayColumn, ConditionOperator.Like, pattern);
            if (table.LogicalColumn is not null)
                text.AddCondition(table.LogicalColumn, ConditionOperator.Like, pattern);
            query.Criteria.AddFilter(text);
        }

        query.AddOrder(table.LogicalColumn ?? table.DisplayColumn, OrderType.Ascending);
        return query;
    }

    /// <summary>Escapes the LIKE wildcards so a search for "new_%" matches the text as typed.</summary>
    public static string EscapeLike(string value) =>
        value.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");

    public static RetrieveMetadataChangesRequest Entities() => new()
    {
        ClientVersionStamp = null,
        Query = new EntityQueryExpression
        {
            Properties = Properties("MetadataId", "LogicalName", "SchemaName", "DisplayName"),
        },
    };

    public static RetrieveMetadataChangesRequest Columns(string entity)
    {
        var criteria = new MetadataFilterExpression(LogicalOperator.And);
        criteria.Conditions.Add(new MetadataConditionExpression(
            "LogicalName",
            MetadataConditionOperator.Equals,
            entity.Trim()));
        return new RetrieveMetadataChangesRequest
        {
            ClientVersionStamp = null,
            Query = new EntityQueryExpression
            {
                Criteria = criteria,
                Properties = Properties("LogicalName", "Attributes"),
                AttributeQuery = new AttributeQueryExpression
                {
                    Properties = Properties("MetadataId", "LogicalName", "SchemaName", "DisplayName", "AttributeOf"),
                },
            },
        };
    }

    public static RetrieveMetadataChangesRequest Relationships() => new()
    {
        ClientVersionStamp = null,
        Query = new EntityQueryExpression
        {
            Properties = Properties("LogicalName", "OneToManyRelationships", "ManyToManyRelationships"),
            RelationshipQuery = new RelationshipQueryExpression
            {
                Properties = Properties(
                    "MetadataId",
                    "SchemaName",
                    "ReferencedEntity",
                    "Entity1LogicalName"),
            },
        },
    };

    private static MetadataPropertiesExpression Properties(params string[] names)
    {
        var properties = new MetadataPropertiesExpression();
        properties.PropertyNames.AddRange(names);
        return properties;
    }
}
