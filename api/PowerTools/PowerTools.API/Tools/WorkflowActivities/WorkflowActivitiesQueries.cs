using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.WorkflowActivities;

public static class WorkflowActivitiesLimits
{
    public const int ActivityPageSize = 250;
    public const int ProcessPageSize = 50;
    public const int MaxProcessPages = 200;
}

public static class WorkflowActivitiesQueries
{
    public static QueryExpression Activities(int pageNumber, string? pagingCookie, Guid? pluginTypeId)
    {
        var query = new QueryExpression("plugintype")
        {
            ColumnSet = new ColumnSet(
                "plugintypeid",
                "name",
                "typename",
                "createdon",
                "modifiedon",
                "createdby",
                "modifiedby",
                "version",
                "pluginassemblyid",
                "customworkflowactivityinfo",
                "assemblyname"),
            PageInfo = Page(pageNumber, pagingCookie, WorkflowActivitiesLimits.ActivityPageSize),
        };
        query.Criteria.AddCondition("isworkflowactivity", ConditionOperator.Equal, true);
        query.Criteria.AddCondition("componentstate", ConditionOperator.Equal, 0);
        if (pluginTypeId is Guid id)
            query.Criteria.AddCondition("plugintypeid", ConditionOperator.Equal, id);

        query.Orders.Add(new OrderExpression("assemblyname", OrderType.Ascending));
        query.Orders.Add(new OrderExpression("plugintypeid", OrderType.Ascending));

        var assembly = query.AddLink(
            "pluginassembly",
            "pluginassemblyid",
            "pluginassemblyid",
            JoinOperator.Inner);
        assembly.Columns = new ColumnSet(false);
        assembly.LinkCriteria.AddCondition("sourcetype", ConditionOperator.Equal, 0);
        return query;
    }

    public static QueryExpression Processes(int pageNumber, string? pagingCookie)
    {
        var query = new QueryExpression("workflow")
        {
            ColumnSet = new ColumnSet(
                "workflowid",
                "name",
                "category",
                "primaryentity",
                "createdon",
                "modifiedon",
                "ondemand",
                "triggeroncreate",
                "triggerondelete",
                "triggeronupdateattributelist",
                "xaml"),
            PageInfo = Page(pageNumber, pagingCookie, WorkflowActivitiesLimits.ProcessPageSize),
        };
        query.Criteria.AddCondition("type", ConditionOperator.Equal, 1);
        query.Criteria.AddCondition("category", ConditionOperator.In, 0, 1, 3);
        query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 1);
        query.Criteria.AddCondition("rendererobjecttypecode", ConditionOperator.Null);
        query.Criteria.AddCondition("componentstate", ConditionOperator.Equal, 0);
        query.Orders.Add(new OrderExpression("name", OrderType.Ascending));
        query.Orders.Add(new OrderExpression("workflowid", OrderType.Ascending));
        return query;
    }

    private static PagingInfo Page(int pageNumber, string? pagingCookie, int count) =>
        new()
        {
            PageNumber = pageNumber,
            Count = count,
            PagingCookie = pagingCookie,
        };
}
