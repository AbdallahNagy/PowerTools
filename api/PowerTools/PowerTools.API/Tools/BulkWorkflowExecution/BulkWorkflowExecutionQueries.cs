using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.BulkWorkflowExecution;

public static class BulkWorkflowLimits
{
    public const int ListPageSize = 5000;
    public const int StandardIdPageSize = 5000;
    public const int ElasticIdPageSize = 500;
    public const int MinBatchSize = 1;
    public const int MaxBatchSize = 1000;
    public const int DefaultBatchSize = 100;
    public const int MaxDelaySeconds = 300;
    public const int MaxErrors = 500;
}

public static class BulkWorkflowQueries
{
    /// <summary>Activated, on-demand classic workflow definitions.</summary>
    public static QueryExpression Workflows(int pageNumber, string? pagingCookie, Guid? workflowId = null)
    {
        var query = new QueryExpression("workflow")
        {
            ColumnSet = new ColumnSet(
                "workflowid",
                "name",
                "primaryentity",
                "mode",
                "runas",
                "scope",
                "ismanaged",
                "asyncautodelete"),
            PageInfo = new PagingInfo
            {
                PageNumber = pageNumber,
                Count = BulkWorkflowLimits.ListPageSize,
                PagingCookie = pagingCookie,
            },
        };
        query.Criteria.AddCondition("category", ConditionOperator.Equal, 0);
        query.Criteria.AddCondition("type", ConditionOperator.Equal, 1);
        query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 1);
        query.Criteria.AddCondition("ondemand", ConditionOperator.Equal, true);
        query.Criteria.AddCondition("primaryentity", ConditionOperator.NotEqual, "none");
        if (workflowId is Guid id)
            query.Criteria.AddCondition("workflowid", ConditionOperator.Equal, id);
        query.Orders.Add(new OrderExpression("name", OrderType.Ascending));
        query.Orders.Add(new OrderExpression("workflowid", OrderType.Ascending));
        return query;
    }

    /// <summary>Active public views (system) or saved views (personal) on one entity.</summary>
    public static QueryExpression Views(string viewEntity, string entity, int pageNumber, string? pagingCookie)
    {
        var idAttribute = viewEntity == "savedquery" ? "savedqueryid" : "userqueryid";
        var query = new QueryExpression(viewEntity)
        {
            ColumnSet = new ColumnSet("name", "fetchxml"),
            PageInfo = new PagingInfo
            {
                PageNumber = pageNumber,
                Count = BulkWorkflowLimits.ListPageSize,
                PagingCookie = pagingCookie,
            },
        };
        query.Criteria.AddCondition("querytype", ConditionOperator.Equal, 0);
        query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        query.Criteria.AddCondition("returnedtypecode", ConditionOperator.Equal, entity);
        query.Criteria.AddCondition("fetchxml", ConditionOperator.NotNull);
        query.Orders.Add(new OrderExpression("name", OrderType.Ascending));
        query.Orders.Add(new OrderExpression(idAttribute, OrderType.Ascending));
        return query;
    }

    public static RetrieveEntityRequest EntityMetadata(string entity) =>
        new()
        {
            LogicalName = entity,
            EntityFilters = EntityFilters.Entity,
            RetrieveAsIfPublished = false,
        };
}
