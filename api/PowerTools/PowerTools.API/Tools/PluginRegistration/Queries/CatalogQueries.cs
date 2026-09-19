using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration.Validation;

namespace PowerTools.API.Tools.PluginRegistration.Queries;

public static class CatalogQueries
{
    public static QueryExpression Assemblies()
    {
        var query = new QueryExpression("pluginassembly")
        {
            ColumnSet = new ColumnSet(
                "pluginassemblyid",
                "name",
                "version",
                "publickeytoken",
                "culture",
                "isolationmode",
                "sourcetype",
                "ismanaged",
                "customizationlevel",
                "modifiedon",
                "description"),
            PageInfo = Page(),
        };
        query.Criteria.AddCondition("name", ConditionOperator.NotLike, "CompiledWorkflow%");
        return query;
    }

    public static QueryExpression Types()
    {
        var query = new QueryExpression("plugintype")
        {
            ColumnSet = new ColumnSet(
                "plugintypeid",
                "pluginassemblyid",
                "typename",
                "name",
                "friendlyname",
                "isworkflowactivity",
                "workflowactivitygroupname",
                "description",
                "ismanaged",
                "customizationlevel"),
            PageInfo = Page(),
        };
        query.Criteria.AddCondition("typename", ConditionOperator.NotLike, "Compiled.Workflow%");
        return query;
    }

    public static QueryExpression Steps()
    {
        var query = new QueryExpression("sdkmessageprocessingstep")
        {
            ColumnSet = new ColumnSet(
                "sdkmessageprocessingstepid",
                "name",
                "plugintypeid",
                "sdkmessageid",
                "sdkmessagefilterid",
                "stage",
                "mode",
                "rank",
                "statecode",
                "filteringattributes",
                "impersonatinguserid",
                "description",
                "configuration",
                "sdkmessageprocessingstepsecureconfigid",
                "supporteddeployment",
                "asyncautodelete",
                "ismanaged",
                "customizationlevel",
                "modifiedon"),
            PageInfo = Page(),
        };
        query.Criteria.AddCondition(
            "stage",
            ConditionOperator.In,
            RegistrationOptionValues.CatalogStages.Cast<object>().ToArray());

        var message = query.AddLink(
            "sdkmessage",
            "sdkmessageid",
            "sdkmessageid",
            JoinOperator.LeftOuter);
        message.EntityAlias = "sdkmessage";
        message.Columns = new ColumnSet("name");

        var filter = query.AddLink(
            "sdkmessagefilter",
            "sdkmessagefilterid",
            "sdkmessagefilterid",
            JoinOperator.LeftOuter);
        filter.EntityAlias = "sdkmessagefilter";
        filter.Columns = new ColumnSet("primaryobjecttypecode", "secondaryobjecttypecode");

        var user = query.AddLink(
            "systemuser",
            "impersonatinguserid",
            "systemuserid",
            JoinOperator.LeftOuter);
        user.EntityAlias = "systemuser";
        user.Columns = new ColumnSet("fullname");

        return query;
    }

    public static QueryExpression Images()
    {
        return new QueryExpression("sdkmessageprocessingstepimage")
        {
            ColumnSet = new ColumnSet(
                "sdkmessageprocessingstepimageid",
                "sdkmessageprocessingstepid",
                "name",
                "entityalias",
                "imagetype",
                "attributes",
                "messagepropertyname",
                "ismanaged",
                "customizationlevel"),
            PageInfo = Page(),
        };
    }

    public static QueryExpression ImagesForStep(Guid stepId)
    {
        var query = Images();
        query.Criteria.AddCondition(
            "sdkmessageprocessingstepid",
            ConditionOperator.Equal,
            stepId);
        return query;
    }

    public static QueryExpression TypesForAssembly(Guid assemblyId)
    {
        var query = Types();
        query.Criteria.AddCondition(
            "pluginassemblyid",
            ConditionOperator.Equal,
            assemblyId);
        return query;
    }

    public static QueryExpression StepsForType(Guid pluginTypeId)
    {
        var query = new QueryExpression("sdkmessageprocessingstep")
        {
            ColumnSet = new ColumnSet("sdkmessageprocessingstepid", "plugintypeid"),
            PageInfo = Page(),
        };
        query.Criteria.AddCondition("plugintypeid", ConditionOperator.Equal, pluginTypeId);
        return query;
    }

    private static PagingInfo Page() => new()
    {
        PageNumber = 1,
        Count = RegistrationOptionValues.CatalogPageSize,
    };
}
