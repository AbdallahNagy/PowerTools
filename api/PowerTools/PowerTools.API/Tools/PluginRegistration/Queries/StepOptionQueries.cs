using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.PluginRegistration.Queries;

public static class StepOptionQueries
{
    public static QueryExpression Messages()
    {
        var query = new QueryExpression("sdkmessage")
        {
            ColumnSet = new ColumnSet("sdkmessageid", "name"),
            PageInfo = Page(),
        };
        query.Criteria.AddCondition("isprivate", ConditionOperator.Equal, false);
        query.AddOrder("name", OrderType.Ascending);
        return query;
    }

    public static QueryExpression Filters()
    {
        var query = new QueryExpression("sdkmessagefilter")
        {
            ColumnSet = new ColumnSet(
                "sdkmessagefilterid",
                "sdkmessageid",
                "primaryobjecttypecode",
                "secondaryobjecttypecode",
                "availability"),
            PageInfo = Page(),
        };
        query.Criteria.AddCondition("iscustomprocessingstepallowed", ConditionOperator.Equal, true);
        query.Criteria.AddCondition("isvisible", ConditionOperator.Equal, true);
        return query;
    }

    public static QueryExpression Users()
    {
        var query = new QueryExpression("systemuser")
        {
            ColumnSet = new ColumnSet("systemuserid", "fullname"),
            PageInfo = Page(),
        };
        query.Criteria.AddCondition("isdisabled", ConditionOperator.Equal, false);
        query.AddOrder("fullname", OrderType.Ascending);
        return query;
    }

    private static PagingInfo Page() => new()
    {
        PageNumber = 1,
        Count = RegistrationOptionValues.CatalogPageSize,
    };
}
