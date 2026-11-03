using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.EnvironmentVariables;

public static class EnvironmentVariablesQueries
{
    public const string DefinitionTable = "environmentvariabledefinition";
    public const string DefinitionId = "environmentvariabledefinitionid";
    public const string ValueTable = "environmentvariablevalue";
    public const string ValueId = "environmentvariablevalueid";
    public const int DefinitionComponentType = 380;
    public const int ValueComponentType = 381;
    public const int PageSize = 5000;
    /// <summary>Ids per <c>In</c> condition, well under the query length limits.</summary>
    public const int InBatchSize = 200;

    public static readonly string[] DefinitionColumns =
    [
        "schemaname", "displayname", "description", "defaultvalue", "type", "secretstore",
        "statecode", "ismanaged", "iscustomizable", "parentdefinitionid",
    ];

    public static readonly string[] ValueColumns = [DefinitionId, "value", "ismanaged", "schemaname"];

    /// <summary>
    /// One page of definitions alone. Joining values or solutions here would multiply rows,
    /// so the page would count joined rows and one definition could split across two pages.
    /// </summary>
    public static QueryExpression Definitions(int pageNumber, string? pagingCookie)
    {
        var query = new QueryExpression(DefinitionTable)
        {
            ColumnSet = new ColumnSet(DefinitionColumns),
            PageInfo = Page(pageNumber, pagingCookie),
        };
        query.AddOrder("displayname", OrderType.Ascending);
        query.AddOrder(DefinitionId, OrderType.Ascending);
        return query;
    }

    public static QueryExpression DefinitionsById(IReadOnlyCollection<Guid> ids)
    {
        var query = new QueryExpression(DefinitionTable) { ColumnSet = new ColumnSet(DefinitionColumns) };
        query.Criteria.AddCondition(DefinitionId, ConditionOperator.In, ids.Cast<object>().ToArray());
        return query;
    }

    public static QueryExpression Values(int pageNumber, string? pagingCookie)
    {
        var query = new QueryExpression(ValueTable)
        {
            ColumnSet = new ColumnSet(ValueColumns),
            PageInfo = Page(pageNumber, pagingCookie),
        };
        query.AddOrder(ValueId, OrderType.Ascending);
        return query;
    }

    /// <summary>Every value row of one definition, read fresh before a value is created or updated.</summary>
    public static QueryExpression ValuesForDefinition(Guid definitionId)
    {
        var query = new QueryExpression(ValueTable) { ColumnSet = new ColumnSet(ValueColumns) };
        query.Criteria.AddCondition(DefinitionId, ConditionOperator.Equal, definitionId);
        return query;
    }

    public static QueryExpression ValueById(Guid valueId)
    {
        var query = new QueryExpression(ValueTable) { ColumnSet = new ColumnSet(ValueColumns), TopCount = 1 };
        query.Criteria.AddCondition(ValueId, ConditionOperator.Equal, valueId);
        return query;
    }

    /// <summary>Managed solutions that carry the given value rows (component type 381).</summary>
    public static QueryExpression ManagedValueSolutions(IReadOnlyCollection<Guid> valueIds)
    {
        var query = new QueryExpression("solutioncomponent") { ColumnSet = new ColumnSet("objectid") };
        query.Criteria.AddCondition("componenttype", ConditionOperator.Equal, ValueComponentType);
        query.Criteria.AddCondition("objectid", ConditionOperator.In, valueIds.Cast<object>().ToArray());
        var solution = query.AddLink("solution", "solutionid", "solutionid", JoinOperator.Inner);
        solution.EntityAlias = "sol";
        solution.Columns = new ColumnSet("friendlyname", "uniquename");
        solution.LinkCriteria.AddCondition("ismanaged", ConditionOperator.Equal, true);
        return query;
    }

    /// <summary>Unmanaged, visible solutions other than Default, with their publisher prefix.</summary>
    public static QueryExpression Solutions(int pageNumber, string? pagingCookie, string? uniqueName = null)
    {
        var query = new QueryExpression("solution")
        {
            ColumnSet = new ColumnSet("uniquename", "friendlyname"),
            PageInfo = Page(pageNumber, pagingCookie),
        };
        query.Criteria.AddCondition("ismanaged", ConditionOperator.Equal, false);
        query.Criteria.AddCondition("isvisible", ConditionOperator.Equal, true);
        query.Criteria.AddCondition("uniquename", ConditionOperator.NotEqual, "Default");
        if (!string.IsNullOrWhiteSpace(uniqueName))
            query.Criteria.AddCondition("uniquename", ConditionOperator.Equal, uniqueName);
        query.AddOrder("friendlyname", OrderType.Ascending);
        query.AddOrder("solutionid", OrderType.Ascending);
        var publisher = query.AddLink("publisher", "publisherid", "publisherid", JoinOperator.Inner);
        publisher.EntityAlias = "pub";
        publisher.Columns = new ColumnSet("customizationprefix");
        return query;
    }

    private static PagingInfo Page(int pageNumber, string? pagingCookie) => new()
    {
        Count = PageSize,
        PageNumber = pageNumber,
        PagingCookie = pagingCookie,
    };
}
