using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Catalog;

public sealed class PluginRegistrationCatalogQueriesTests
{
    [Fact]
    public void Queries_select_only_catalog_columns_and_enable_paging()
    {
        AssertQuery(
            PluginRegistrationCatalogQueries.CreateAssemblyQuery(),
            "pluginassembly",
            "pluginassemblyid", "name", "version", "culture", "publickeytoken",
            "sourcetype", "isolationmode", "ismanaged", "iscustomizable",
            "versionnumber", "description");
        AssertQuery(
            PluginRegistrationCatalogQueries.CreateTypeQuery(),
            "plugintype",
            "plugintypeid", "pluginassemblyid", "typename", "name", "friendlyname",
            "description", "workflowactivitygroupname", "isworkflowactivity", "ismanaged",
            "iscustomizable", "versionnumber");
        AssertQuery(
            PluginRegistrationCatalogQueries.CreateStepQuery(),
            "sdkmessageprocessingstep",
            "sdkmessageprocessingstepid", "plugintypeid", "name", "description",
            "sdkmessageid", "sdkmessagefilterid", "stage", "mode", "rank", "statecode",
            "ismanaged", "iscustomizable", "versionnumber",
            "sdkmessageprocessingstepsecureconfigid");
        AssertQuery(
            PluginRegistrationCatalogQueries.CreateImageQuery(),
            "sdkmessageprocessingstepimage",
            "sdkmessageprocessingstepimageid", "sdkmessageprocessingstepid", "name",
            "description", "imagetype", "entityalias", "attributes", "ismanaged",
            "iscustomizable", "versionnumber");

        Assert.DoesNotContain("content",
            PluginRegistrationCatalogQueries.CreateAssemblyQuery().ColumnSet.Columns,
            StringComparer.OrdinalIgnoreCase);
        Assert.DoesNotContain(
            PluginRegistrationCatalogQueries.CreateStepQuery().ColumnSet.Columns,
            column => column.Contains("secureconfig", StringComparison.OrdinalIgnoreCase)
                && !column.Equals("sdkmessageprocessingstepsecureconfigid", StringComparison.OrdinalIgnoreCase));

        var stepLinks = PluginRegistrationCatalogQueries.CreateStepQuery().LinkEntities;
        Assert.Collection(
            stepLinks
                .Where(link => link.EntityAlias != "solutioncomponent")
                .OrderBy(link => link.EntityAlias),
            link => AssertLink(link, "sdkmessagefilter", "filter",
                "primaryobjecttypecode", "secondaryobjecttypecode"),
            link => AssertLink(link, "sdkmessage", "message", "name"));

        AssertSolutionLink(
            PluginRegistrationCatalogQueries.CreateAssemblyQuery(),
            "pluginassemblyid",
            91);
        AssertSolutionLink(
            PluginRegistrationCatalogQueries.CreateTypeQuery(),
            "plugintypeid",
            90);
        AssertSolutionLink(
            PluginRegistrationCatalogQueries.CreateStepQuery(),
            "sdkmessageprocessingstepid",
            92);
        AssertSolutionLink(
            PluginRegistrationCatalogQueries.CreateImageQuery(),
            "sdkmessageprocessingstepimageid",
            93);
    }

    [Fact]
    public void Workflow_dependency_enrichment_reads_only_safe_process_metadata()
    {
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();

        var query = PluginRegistrationCatalogQueries.CreateWorkflowDependencyQuery([first, second]);

        Assert.Equal("workflow", query.EntityName);
        Assert.Equal(new[] { "workflowid", "name", "category", "statecode", "ismanaged", "iscustomizable", "versionnumber" }.Order(),
            query.ColumnSet.Columns.Order());
        Assert.DoesNotContain(query.ColumnSet.Columns, column => column.Contains("xaml", StringComparison.OrdinalIgnoreCase));
        var condition = Assert.Single(query.Criteria.Conditions);
        Assert.Equal("workflowid", condition.AttributeName);
        Assert.Equal(ConditionOperator.In, condition.Operator);
        Assert.Equal(new[] { first, second }.Order(), condition.Values.Cast<Guid>().Order());
        AssertSolutionLink(query, "workflowid", 29);
    }

    [Fact]
    public async Task Gateway_retrieves_every_page_and_copies_the_server_cookie()
    {
        var firstAssemblyId = Guid.NewGuid();
        var pluginTypeId = Guid.NewGuid();
        var stepId = Guid.NewGuid();
        var imageId = Guid.NewGuid();
        var proxy = DispatchProxy.Create<IOrganizationServiceAsync2, PagedOrganizationServiceProxy>();
        var handler = (PagedOrganizationServiceProxy)(object)proxy;
        handler.Responses["pluginassembly"] = new Queue<EntityCollection>(
        [
            Page(WithSolution(new Entity("pluginassembly", firstAssemblyId)
            {
                ["name"] = "First",
                ["version"] = "1.0.0.0"
            }, "Zeta Solution"), moreRecords: true, cookie: "assembly-cookie"),
            Page(WithSolution(new Entity("pluginassembly", firstAssemblyId)
            {
                ["name"] = "First",
                ["version"] = "1.0.0.0"
            }, "Alpha Solution"))
        ]);
        handler.Responses["plugintype"] = new Queue<EntityCollection>(
        [
            Page(WithSolution(new Entity("plugintype", pluginTypeId)
            {
                ["pluginassemblyid"] = new EntityReference("pluginassembly", firstAssemblyId),
                ["typename"] = "Contoso.Plugin",
                ["name"] = "Plugin"
            }, "Plugin Solution"))
        ]);
        handler.Responses["sdkmessageprocessingstep"] = new Queue<EntityCollection>(
        [
            Page(WithSolution(new Entity("sdkmessageprocessingstep", stepId)
            {
                ["plugintypeid"] = new EntityReference("plugintype", pluginTypeId),
                ["name"] = "Create account",
                ["sdkmessageprocessingstepsecureconfigid"] = new EntityReference(
                    "sdkmessageprocessingstepsecureconfig",
                    Guid.NewGuid())
            }, "Step Solution"))
        ]);
        handler.Responses["sdkmessageprocessingstepimage"] = new Queue<EntityCollection>(
        [
            Page(WithSolution(new Entity("sdkmessageprocessingstepimage", imageId)
            {
                ["sdkmessageprocessingstepid"] = new EntityReference(
                    "sdkmessageprocessingstep",
                    stepId),
                ["name"] = "Pre Image"
            }, "Image Solution"))
        ]);

        var rows = await new DataversePluginRegistrationGateway(proxy)
            .RetrieveCatalogRowsAsync(CancellationToken.None);

        var assembly = Assert.Single(rows.Assemblies);
        Assert.Equal(firstAssemblyId, assembly.Id);
        Assert.Equal("Alpha Solution, Zeta Solution", assembly.SolutionDisplayName);
        Assert.Equal("Plugin Solution", Assert.Single(rows.Types).SolutionDisplayName);
        var step = Assert.Single(rows.Steps);
        Assert.Equal("Step Solution", step.SolutionDisplayName);
        Assert.True(step.SecureConfigExists);
        Assert.Equal("Image Solution", Assert.Single(rows.Images).SolutionDisplayName);
        var assemblyRequests = handler.Queries
            .Where(query => query.EntityName == "pluginassembly")
            .ToArray();
        Assert.Equal(2, assemblyRequests.Length);
        Assert.Equal(1, assemblyRequests[0].PageInfo.PageNumber);
        Assert.Null(assemblyRequests[0].PageInfo.PagingCookie);
        Assert.Equal(2, assemblyRequests[1].PageInfo.PageNumber);
        Assert.Equal("assembly-cookie", assemblyRequests[1].PageInfo.PagingCookie);
        Assert.Equal(5, handler.Queries.Count);
    }

    [Fact]
    public async Task Gateway_reads_and_preserves_delete_dependencies_for_ordinary_plugin_types()
    {
        var assemblyId = Guid.NewGuid();
        var pluginTypeId = Guid.NewGuid();
        var customApiId = Guid.NewGuid();
        var proxy = DispatchProxy.Create<IOrganizationServiceAsync2, PagedOrganizationServiceProxy>();
        var handler = (PagedOrganizationServiceProxy)(object)proxy;
        handler.Responses["pluginassembly"] = new Queue<EntityCollection>([Page(new Entity("pluginassembly", assemblyId) { ["name"] = "Contoso", ["version"] = "1.0" })]);
        handler.Responses["plugintype"] = new Queue<EntityCollection>([Page(new Entity("plugintype", pluginTypeId)
        {
            ["pluginassemblyid"] = new EntityReference("pluginassembly", assemblyId), ["typename"] = "Contoso.Plugin", ["name"] = "Plugin"
        })]);
        handler.Responses["sdkmessageprocessingstep"] = new Queue<EntityCollection>([Page()]);
        handler.Responses["sdkmessageprocessingstepimage"] = new Queue<EntityCollection>([Page()]);
        handler.DependencyResponses.Enqueue(Dependencies(new Entity("dependency")
        {
            ["dependentcomponenttype"] = new OptionSetValue(371),
            ["dependentcomponentobjectid"] = new EntityReference("customapi", customApiId) { Name = "Submit Account" }
        }));

        var rows = await new DataversePluginRegistrationGateway(proxy).RetrieveCatalogRowsAsync(CancellationToken.None);

        var dependency = Assert.Single(rows.Dependencies);
        Assert.Equal(pluginTypeId, dependency.HandlerId);
        Assert.True(dependency.IsCustomApi);
        Assert.True(dependency.IsExternal);
        Assert.Equal("Custom API", dependency.ComponentTypeLabel);
        Assert.Equal(customApiId, dependency.ComponentId);
        Assert.Equal([pluginTypeId], handler.DependencyObjectIds);
    }

    private static void AssertQuery(
        QueryExpression query,
        string entityName,
        params string[] approvedColumns)
    {
        Assert.Equal(entityName, query.EntityName);
        Assert.Equal(approvedColumns.Order(), query.ColumnSet.Columns.Order());
        Assert.NotNull(query.PageInfo);
        Assert.Equal(1, query.PageInfo.PageNumber);
        Assert.True(query.PageInfo.Count > 0);
        Assert.Null(query.TopCount);
    }

    private static void AssertLink(
        LinkEntity link,
        string entityName,
        string alias,
        params string[] approvedColumns)
    {
        Assert.Equal(entityName, link.LinkToEntityName);
        Assert.Equal(alias, link.EntityAlias);
        Assert.Equal(JoinOperator.LeftOuter, link.JoinOperator);
        Assert.Equal(approvedColumns.Order(), link.Columns.Columns.Order());
    }

    private static void AssertSolutionLink(
        QueryExpression query,
        string rootIdAttribute,
        int componentType)
    {
        var componentLink = Assert.Single(
            query.LinkEntities,
            link => link.EntityAlias == "solutioncomponent");
        Assert.Equal("solutioncomponent", componentLink.LinkToEntityName);
        Assert.Equal(rootIdAttribute, componentLink.LinkFromAttributeName);
        Assert.Equal("objectid", componentLink.LinkToAttributeName);
        Assert.Equal(JoinOperator.LeftOuter, componentLink.JoinOperator);
        Assert.Empty(componentLink.Columns.Columns);
        var componentTypeCondition = Assert.Single(componentLink.LinkCriteria.Conditions);
        Assert.Equal("componenttype", componentTypeCondition.AttributeName);
        Assert.Equal(ConditionOperator.Equal, componentTypeCondition.Operator);
        Assert.Equal(componentType, Assert.Single(componentTypeCondition.Values));

        var solutionLink = Assert.Single(componentLink.LinkEntities);
        AssertLink(solutionLink, "solution", "solution", "friendlyname");
        Assert.Equal("solutionid", solutionLink.LinkFromAttributeName);
        Assert.Equal("solutionid", solutionLink.LinkToAttributeName);
    }

    private static Entity WithSolution(Entity entity, string friendlyName)
    {
        entity["solution.friendlyname"] = new AliasedValue(
            "solution",
            "friendlyname",
            friendlyName);
        return entity;
    }

    private static EntityCollection Page(
        Entity? entity = null,
        bool moreRecords = false,
        string? cookie = null)
    {
        var page = new EntityCollection
        {
            MoreRecords = moreRecords,
            PagingCookie = cookie
        };
        if (entity is not null)
        {
            page.Entities.Add(entity);
        }

        return page;
    }

    private static EntityCollection Dependencies(params Entity[] dependencies) => new(dependencies);

    public class PagedOrganizationServiceProxy : DispatchProxy
    {
        public Dictionary<string, Queue<EntityCollection>> Responses { get; } = [];
        public List<QueryExpression> Queries { get; } = [];
        public Queue<EntityCollection> DependencyResponses { get; } = [];
        public List<Guid> DependencyObjectIds { get; } = [];

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            if (targetMethod?.Name == nameof(IOrganizationServiceAsync2.RetrieveMultipleAsync)
                && args is [QueryExpression query, CancellationToken])
            {
                Queries.Add(new QueryExpression(query.EntityName)
                {
                    PageInfo = new PagingInfo
                    {
                        Count = query.PageInfo.Count,
                        PageNumber = query.PageInfo.PageNumber,
                        PagingCookie = query.PageInfo.PagingCookie
                    }
                });
                return Task.FromResult(Responses[query.EntityName].Dequeue());
            }

            if (targetMethod?.Name == nameof(IOrganizationServiceAsync2.ExecuteAsync)
                && args is [OrganizationRequest request, CancellationToken]
                && request.RequestName == "RetrieveDependenciesForDelete")
            {
                DependencyObjectIds.Add((Guid)request.Parameters["ObjectId"]);
                var response = new OrganizationResponse();
                response.Results["EntityDependencies"] = DependencyResponses.Count > 0
                    ? DependencyResponses.Dequeue()
                    : new EntityCollection();
                return Task.FromResult(response);
            }

            throw new NotSupportedException(targetMethod?.Name);
        }
    }
}
