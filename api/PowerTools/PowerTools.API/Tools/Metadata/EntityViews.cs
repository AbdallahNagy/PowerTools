using System.ServiceModel;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.Metadata;

public sealed record EntityViewDto(
    Guid Id,
    string Name,
    string Kind,
    bool IsDefault,
    IReadOnlyList<string> Columns,
    string FetchXml);

public static class EntityViews
{
    // Public, Advanced Find, Associated, Quick Find and Lookup views.
    private static readonly object[] SystemQueryTypes = [0, 1, 2, 4, 64];

    public static async Task<IReadOnlyList<EntityViewDto>> RetrieveAsync(
        IOrganizationServiceAsync2 svc,
        string logicalName)
    {
        var systemViews = await svc.RetrieveMultipleAsync(SystemViewsQuery(logicalName));
        var views = systemViews.Entities.Select(view => ToDto(view, "system")).ToList();

        try
        {
            var personalViews = await svc.RetrieveMultipleAsync(PersonalViewsQuery(logicalName));
            views.AddRange(personalViews.Entities.Select(view => ToDto(view, "personal")));
        }
        catch (FaultException<OrganizationServiceFault>)
        {
            // Users without read access to personal views still get system views.
        }

        return views.Where(view => view.Columns.Count > 0).ToList();
    }

    public static QueryExpression SystemViewsQuery(string logicalName)
    {
        var query = new QueryExpression("savedquery")
        {
            ColumnSet = new ColumnSet("name", "layoutxml", "fetchxml", "isdefault")
        };
        query.Criteria.AddCondition("returnedtypecode", ConditionOperator.Equal, logicalName);
        query.Criteria.AddCondition("querytype", ConditionOperator.In, SystemQueryTypes);
        query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        query.Criteria.AddCondition("layoutxml", ConditionOperator.NotNull);
        query.Orders.Add(new OrderExpression("name", OrderType.Ascending));
        return query;
    }

    public static QueryExpression PersonalViewsQuery(string logicalName)
    {
        var query = new QueryExpression("userquery")
        {
            ColumnSet = new ColumnSet("name", "layoutxml", "fetchxml")
        };
        query.Criteria.AddCondition("returnedtypecode", ConditionOperator.Equal, logicalName);
        query.Criteria.AddCondition("querytype", ConditionOperator.Equal, 0);
        query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
        query.Criteria.AddCondition("layoutxml", ConditionOperator.NotNull);
        query.Orders.Add(new OrderExpression("name", OrderType.Ascending));
        return query;
    }

    public static EntityViewDto ToDto(Entity view, string kind) =>
        new(
            view.Id,
            view.GetAttributeValue<string>("name") ?? "",
            kind,
            view.GetAttributeValue<bool?>("isdefault") == true,
            DefaultViewColumns.ParseRootColumns(view.GetAttributeValue<string>("layoutxml")),
            view.GetAttributeValue<string>("fetchxml") ?? "");
}
