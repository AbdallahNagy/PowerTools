using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.SolutionComponentsMover;

public static class SolutionComponentsMoverLimits
{
    public const int PageSize = 5000;
    public const int MaxServiceProtectionRetries = 5;
    public const int EntityComponentType = 1;
    public const int EnvironmentVariableDefinition = 380;
}

public static class SolutionComponentsMoverQueries
{
    public static QueryExpression Solutions()
    {
        var query = new QueryExpression("solution")
        {
            ColumnSet = new ColumnSet(
                "publisherid",
                "installedon",
                "version",
                "uniquename",
                "friendlyname",
                "ismanaged"),
        };
        query.Criteria.AddCondition("isvisible", ConditionOperator.Equal, true);
        query.Criteria.AddCondition("uniquename", ConditionOperator.NotEqual, "Default");
        query.AddOrder("solutionid", OrderType.Ascending);
        return query;
    }

    public static QueryExpression Definitions()
    {
        var query = new QueryExpression("solutioncomponentdefinition")
        {
            ColumnSet = new ColumnSet("name", "solutioncomponenttype", "primaryentityname"),
        };
        query.Criteria.AddCondition("canbeaddedtosolutioncomponents", ConditionOperator.Equal, true);
        query.AddOrder("name", OrderType.Ascending);
        return query;
    }

    public static QueryExpression Components(
        IReadOnlyList<Guid> sourceIds,
        bool allComponents,
        IReadOnlyList<int> componentTypes)
    {
        var query = new QueryExpression("solutioncomponent")
        {
            ColumnSet = new ColumnSet(
                "solutioncomponentid",
                "solutionid",
                "objectid",
                "componenttype",
                "rootcomponentbehavior"),
        };
        query.Criteria.AddCondition(
            "solutionid",
            ConditionOperator.In,
            sourceIds.Cast<object>().ToArray());
        if (!allComponents)
        {
            query.Criteria.AddCondition(
                "componenttype",
                ConditionOperator.In,
                componentTypes.Cast<object>().ToArray());
        }

        var solution = query.AddLink("solution", "solutionid", "solutionid", JoinOperator.Inner);
        solution.EntityAlias = "solution";
        solution.Columns = new ColumnSet("ismanaged");
        query.AddOrder("solutioncomponentid", OrderType.Ascending);
        return query;
    }
}
