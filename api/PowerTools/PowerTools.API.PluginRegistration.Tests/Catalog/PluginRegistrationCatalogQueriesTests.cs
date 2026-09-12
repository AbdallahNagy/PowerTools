using System.Reflection;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Queries;
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
            "versionnumber");
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
    public async Task Gateway_catalog_does_not_retrieve_delete_dependencies()
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

        Assert.Empty(rows.Dependencies);
        Assert.Empty(handler.DependencyObjectIds);
    }

    [Fact]
    public async Task Gateway_derives_plugin_type_customizability_from_managed_state()
    {
        var unmanagedId = Guid.NewGuid();
        var managedId = Guid.NewGuid();
        var proxy = DispatchProxy.Create<IOrganizationServiceAsync2, PagedOrganizationServiceProxy>();
        var handler = (PagedOrganizationServiceProxy)(object)proxy;
        handler.Responses["pluginassembly"] = new Queue<EntityCollection>([Page()]);
        handler.Responses["plugintype"] = new Queue<EntityCollection>([PageOf(
            new Entity("plugintype", unmanagedId) { ["name"] = "Unmanaged", ["ismanaged"] = false },
            new Entity("plugintype", managedId) { ["name"] = "Managed", ["ismanaged"] = true })]);
        handler.Responses["sdkmessageprocessingstep"] = new Queue<EntityCollection>([Page()]);
        handler.Responses["sdkmessageprocessingstepimage"] = new Queue<EntityCollection>([Page()]);

        var rows = await new DataversePluginRegistrationGateway(proxy)
            .RetrieveCatalogRowsAsync(CancellationToken.None);

        Assert.True(rows.Types.Single(type => type.Id == unmanagedId).IsCustomizable);
        Assert.False(rows.Types.Single(type => type.Id == managedId).IsCustomizable);
    }

    [Fact]
    public async Task Gateway_uses_exact_component_type_codes_for_every_cascade_delete_request()
    {
        var assembly = Guid.NewGuid();
        var handler = Guid.NewGuid();
        var step = Guid.NewGuid();
        var image = Guid.NewGuid();
        var proxy = DispatchProxy.Create<IOrganizationServiceAsync2, PagedOrganizationServiceProxy>();
        var recorder = (PagedOrganizationServiceProxy)(object)proxy;

        await new DataversePluginRegistrationGateway(proxy).RetrieveCascadeDependenciesAsync([
            new(image, "sdkmessageprocessingstepimage", 4), new(step, "sdkmessageprocessingstep", 3),
            new(handler, "plugintype", 2), new(assembly, "pluginassembly", 1)
        ], CancellationToken.None);

        Assert.Equal([(image, 93), (step, 92), (handler, 90), (assembly, 91)], recorder.DependencyRequests);
    }

    [Fact]
    public async Task Gateway_enriches_workflow_dependencies_requested_by_preflight()
    {
        var handlerId = Guid.NewGuid();
        var workflowId = Guid.NewGuid();
        var proxy = DispatchProxy.Create<IOrganizationServiceAsync2, PagedOrganizationServiceProxy>();
        var recorder = (PagedOrganizationServiceProxy)(object)proxy;
        recorder.DependencyResponses.Enqueue(Dependencies(new Entity("dependency")
        {
            ["dependentcomponenttype"] = new OptionSetValue(29),
            ["dependentcomponentobjectid"] = new EntityReference("workflow", workflowId) { Name = "Old display name" }
        }));
        recorder.Responses["workflow"] = new Queue<EntityCollection>([Page(WithSolution(new Entity("workflow", workflowId)
        {
            ["name"] = "Account approval",
            ["category"] = new OptionSetValue(0),
            ["statecode"] = new OptionSetValue(1),
            ["versionnumber"] = 12L
        }, "Core"))]);

        var dependencies = await new DataversePluginRegistrationGateway(proxy).RetrieveCascadeDependenciesAsync(
            [new(handlerId, "plugintype", 5)], CancellationToken.None);

        var dependency = Assert.Single(dependencies);
        Assert.Equal("Account approval", dependency.Name);
        Assert.Equal("Workflow/action (0)", dependency.ComponentTypeLabel);
        Assert.Equal("1", dependency.StateLabel);
        Assert.Equal(12, dependency.VersionNumber);
        Assert.Equal("Core", dependency.SolutionDisplayName);
    }

    [Fact]
    public async Task Gateway_rejects_a_missing_dependency_payload()
    {
        var proxy = DispatchProxy.Create<IOrganizationServiceAsync2, PagedOrganizationServiceProxy>();
        var recorder = (PagedOrganizationServiceProxy)(object)proxy;
        recorder.OmitNextDependencyPayload = true;

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            new DataversePluginRegistrationGateway(proxy).RetrieveCascadeDependenciesAsync(
                [new(Guid.NewGuid(), "plugintype", 1)], CancellationToken.None));
    }

    [Fact]
    public async Task Gateway_rejects_a_malformed_dependency_payload()
    {
        var proxy = DispatchProxy.Create<IOrganizationServiceAsync2, PagedOrganizationServiceProxy>();
        var recorder = (PagedOrganizationServiceProxy)(object)proxy;
        recorder.UseNextDependencyPayload = true;
        recorder.NextDependencyPayload = "not an entity collection";

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            new DataversePluginRegistrationGateway(proxy).RetrieveCascadeDependenciesAsync(
                [new(Guid.NewGuid(), "plugintype", 1)], CancellationToken.None));
    }

    [Fact]
    public async Task Gateway_aggregates_duplicate_workflow_solution_rows_and_dependencies()
    {
        var handlerId = Guid.NewGuid();
        var workflowId = Guid.NewGuid();
        var proxy = DispatchProxy.Create<IOrganizationServiceAsync2, PagedOrganizationServiceProxy>();
        var recorder = (PagedOrganizationServiceProxy)(object)proxy;
        recorder.DependencyResponses.Enqueue(Dependencies(
            WorkflowDependency(workflowId), WorkflowDependency(workflowId)));
        recorder.Responses["workflow"] = new Queue<EntityCollection>([PageOf(
            WithSolution(Workflow(workflowId, 12), "Zeta"),
            WithSolution(Workflow(workflowId, 12), "Alpha"))]);

        var dependencies = await new DataversePluginRegistrationGateway(proxy).RetrieveCascadeDependenciesAsync(
            [new(handlerId, "plugintype", 5)], CancellationToken.None);

        var dependency = Assert.Single(dependencies);
        Assert.Equal("Alpha, Zeta", dependency.SolutionDisplayName);
        Assert.Equal(12, dependency.VersionNumber);
    }

    [Fact]
    public async Task Gateway_rejects_an_unresolved_workflow_dependency()
    {
        var workflowId = Guid.NewGuid();
        var proxy = DispatchProxy.Create<IOrganizationServiceAsync2, PagedOrganizationServiceProxy>();
        var recorder = (PagedOrganizationServiceProxy)(object)proxy;
        recorder.DependencyResponses.Enqueue(Dependencies(WorkflowDependency(workflowId)));
        recorder.Responses["workflow"] = new Queue<EntityCollection>([Page()]);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            new DataversePluginRegistrationGateway(proxy).RetrieveCascadeDependenciesAsync(
                [new(Guid.NewGuid(), "plugintype", 5)], CancellationToken.None));
    }

    [Fact]
    public async Task Gateway_rejects_conflicting_workflow_versions()
    {
        var workflowId = Guid.NewGuid();
        var proxy = DispatchProxy.Create<IOrganizationServiceAsync2, PagedOrganizationServiceProxy>();
        var recorder = (PagedOrganizationServiceProxy)(object)proxy;
        recorder.DependencyResponses.Enqueue(Dependencies(WorkflowDependency(workflowId)));
        recorder.Responses["workflow"] = new Queue<EntityCollection>([PageOf(
            WithSolution(Workflow(workflowId, 12), "Alpha"),
            WithSolution(Workflow(workflowId, 13), "Zeta"))]);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            new DataversePluginRegistrationGateway(proxy).RetrieveCascadeDependenciesAsync(
                [new(Guid.NewGuid(), "plugintype", 5)], CancellationToken.None));
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

    private static EntityCollection PageOf(params Entity[] entities)
    {
        var page = new EntityCollection();
        page.Entities.AddRange(entities);
        return page;
    }

    private static Entity Workflow(Guid id, long version) => new("workflow", id)
    {
        ["name"] = "Account approval",
        ["category"] = new OptionSetValue(0),
        ["statecode"] = new OptionSetValue(1),
        ["versionnumber"] = version
    };

    private static Entity WorkflowDependency(Guid id) => new("dependency")
    {
        ["dependentcomponenttype"] = new OptionSetValue(29),
        ["dependentcomponentobjectid"] = new EntityReference("workflow", id) { Name = "Account approval" }
    };

    private static EntityCollection Dependencies(params Entity[] dependencies) => new(dependencies);

    public class PagedOrganizationServiceProxy : DispatchProxy
    {
        public Dictionary<string, Queue<EntityCollection>> Responses { get; } = [];
        public List<QueryExpression> Queries { get; } = [];
        public Queue<EntityCollection> DependencyResponses { get; } = [];
        public List<Guid> DependencyObjectIds { get; } = [];
        public List<(Guid Id, int ComponentType)> DependencyRequests { get; } = [];
        public bool OmitNextDependencyPayload { get; set; }
        public bool UseNextDependencyPayload { get; set; }
        public object? NextDependencyPayload { get; set; }

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
                DependencyRequests.Add(((Guid)request.Parameters["ObjectId"], (int)request.Parameters["ComponentType"]));
                var response = new OrganizationResponse();
                if (OmitNextDependencyPayload)
                {
                    OmitNextDependencyPayload = false;
                }
                else if (UseNextDependencyPayload)
                {
                    UseNextDependencyPayload = false;
                    response.Results["EntityDependencies"] = NextDependencyPayload;
                }
                else
                {
                    response.Results["EntityDependencies"] = DependencyResponses.Count > 0
                        ? DependencyResponses.Dequeue()
                        : new EntityCollection();
                }
                return Task.FromResult(response);
            }

            throw new NotSupportedException(targetMethod?.Name);
        }
    }
}
