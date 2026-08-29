using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.PluginRegistration;

public static class PluginRegistrationCatalogQueries
{
    private const int PageSize = 5_000;

    public static QueryExpression CreateAssemblyQuery() =>
        CreatePagedQuery(
            "pluginassembly",
            "pluginassemblyid", "name", "version", "culture", "publickeytoken",
            "sourcetype", "isolationmode", "ismanaged", "iscustomizable",
            "versionnumber", "description");

    public static QueryExpression CreateTypeQuery() =>
        CreatePagedQuery(
            "plugintype",
            "plugintypeid", "pluginassemblyid", "typename", "name", "friendlyname",
            "description", "workflowactivitygroupname", "isworkflowactivity", "ismanaged",
            "iscustomizable", "versionnumber");

    public static QueryExpression CreateStepQuery()
    {
        var query = CreatePagedQuery(
            "sdkmessageprocessingstep",
            "sdkmessageprocessingstepid", "plugintypeid", "name", "description",
            "sdkmessageid", "sdkmessagefilterid", "stage", "mode", "rank", "statecode",
            "ismanaged", "iscustomizable", "versionnumber",
            "sdkmessageprocessingstepsecureconfigid");
        query.AddLink(
            "sdkmessage",
            "sdkmessageid",
            "sdkmessageid",
            JoinOperator.LeftOuter).EntityAlias = "message";
        query.LinkEntities[^1].Columns = new ColumnSet("name");
        query.AddLink(
            "sdkmessagefilter",
            "sdkmessagefilterid",
            "sdkmessagefilterid",
            JoinOperator.LeftOuter).EntityAlias = "filter";
        query.LinkEntities[^1].Columns = new ColumnSet(
            "primaryobjecttypecode",
            "secondaryobjecttypecode");
        return query;
    }

    public static QueryExpression CreateImageQuery() =>
        CreatePagedQuery(
            "sdkmessageprocessingstepimage",
            "sdkmessageprocessingstepimageid", "sdkmessageprocessingstepid", "name",
            "description", "imagetype", "entityalias", "attributes", "ismanaged",
            "iscustomizable", "versionnumber");

    private static QueryExpression CreatePagedQuery(
        string entityName,
        params string[] columns) =>
        new(entityName)
        {
            ColumnSet = new ColumnSet(columns),
            PageInfo = new PagingInfo
            {
                Count = PageSize,
                PageNumber = 1
            }
        };
}
