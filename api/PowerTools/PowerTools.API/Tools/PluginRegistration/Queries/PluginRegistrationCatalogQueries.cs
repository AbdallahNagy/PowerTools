using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration.Enums;

namespace PowerTools.API.Tools.PluginRegistration.Queries;

public static class PluginRegistrationCatalogQueries
{
    private const int PageSize = 5_000;

    public static QueryExpression CreateAssemblyQuery() =>
        AddSolutionDisplayLink(
            CreatePagedQuery(
                "pluginassembly",
                [
                    "pluginassemblyid", "name", "version", "culture", "publickeytoken",
                    "sourcetype", "isolationmode", "ismanaged", "iscustomizable",
                    "versionnumber", "description"
                ]),
            "pluginassemblyid",
            SolutionComponentType.PluginAssembly);

    public static QueryExpression CreateTypeQuery() =>
        AddSolutionDisplayLink(
            CreatePagedQuery(
                "plugintype",
                [
                    "plugintypeid", "pluginassemblyid", "typename", "name", "friendlyname",
                    "description", "workflowactivitygroupname", "isworkflowactivity", "ismanaged",
                    "versionnumber"
                ]),
            "plugintypeid",
            SolutionComponentType.PluginType);

    public static QueryExpression CreateStepQuery()
    {
        var query = CreatePagedQuery(
            "sdkmessageprocessingstep",
            [
                "sdkmessageprocessingstepid", "plugintypeid", "name", "description",
                "sdkmessageid", "sdkmessagefilterid", "stage", "mode", "rank", "statecode",
                "ismanaged", "iscustomizable", "versionnumber",
                "sdkmessageprocessingstepsecureconfigid"
            ]);
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
        return AddSolutionDisplayLink(query, "sdkmessageprocessingstepid",
            SolutionComponentType.SdkMessageProcessingStep);
    }

    public static QueryExpression CreateImageQuery() =>
        AddSolutionDisplayLink(
            CreatePagedQuery(
                "sdkmessageprocessingstepimage",
                [
                    "sdkmessageprocessingstepimageid", "sdkmessageprocessingstepid", "name",
                    "description", "imagetype", "entityalias", "attributes", "ismanaged",
                    "iscustomizable", "versionnumber"
                ]),
            "sdkmessageprocessingstepimageid",
            SolutionComponentType.SdkMessageProcessingStepImage);

    /// <summary>Reads registration-facing workflow/action metadata only; never a process definition.</summary>
    public static QueryExpression CreateWorkflowDependencyQuery(IReadOnlyCollection<Guid> processIds)
    {
        ArgumentNullException.ThrowIfNull(processIds);
        var query = AddSolutionDisplayLink(CreatePagedQuery(
                "workflow",
                ["workflowid", "name", "category", "statecode", "ismanaged", "iscustomizable", "versionnumber"]),
            "workflowid", SolutionComponentType.Workflow);
        if (processIds.Count > 0)
            query.Criteria.AddCondition("workflowid", ConditionOperator.In, processIds.Cast<object>().ToArray());
        return query;
    }

    private static QueryExpression AddSolutionDisplayLink(
        QueryExpression query,
        string rootIdAttribute,
        SolutionComponentType componentType)
    {
        var componentLink = query.AddLink(
            "solutioncomponent",
            rootIdAttribute,
            "objectid",
            JoinOperator.LeftOuter);
        componentLink.EntityAlias = "solutioncomponent";
        componentLink.LinkCriteria.AddCondition(
            "componenttype",
            ConditionOperator.Equal,
            (int)componentType);

        var solutionLink = componentLink.AddLink(
            "solution",
            "solutionid",
            "solutionid",
            JoinOperator.LeftOuter);
        solutionLink.EntityAlias = "solution";
        solutionLink.Columns = new ColumnSet("friendlyname");
        return query;
    }

    private static QueryExpression CreatePagedQuery(
        string entityName,
        string[] columns) =>
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