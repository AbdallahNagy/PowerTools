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
            stepLinks.OrderBy(link => link.EntityAlias),
            link => AssertLink(link, "sdkmessagefilter", "filter",
                "primaryobjecttypecode", "secondaryobjecttypecode"),
            link => AssertLink(link, "sdkmessage", "message", "name"));
    }

    [Fact]
    public async Task Gateway_retrieves_every_page_and_copies_the_server_cookie()
    {
        var firstAssemblyId = Guid.NewGuid();
        var secondAssemblyId = Guid.NewGuid();
        var proxy = DispatchProxy.Create<IOrganizationServiceAsync2, PagedOrganizationServiceProxy>();
        var handler = (PagedOrganizationServiceProxy)(object)proxy;
        handler.Responses["pluginassembly"] = new Queue<EntityCollection>(
        [
            Page(new Entity("pluginassembly", firstAssemblyId)
            {
                ["name"] = "First",
                ["version"] = "1.0.0.0"
            }, moreRecords: true, cookie: "assembly-cookie"),
            Page(new Entity("pluginassembly", secondAssemblyId)
            {
                ["name"] = "Second",
                ["version"] = "2.0.0.0"
            })
        ]);
        handler.Responses["plugintype"] = new Queue<EntityCollection>([Page()]);
        handler.Responses["sdkmessageprocessingstep"] = new Queue<EntityCollection>([Page()]);
        handler.Responses["sdkmessageprocessingstepimage"] = new Queue<EntityCollection>([Page()]);

        var rows = await new DataversePluginRegistrationGateway(proxy)
            .RetrieveCatalogRowsAsync(CancellationToken.None);

        Assert.Equal([firstAssemblyId, secondAssemblyId], rows.Assemblies.Select(row => row.Id));
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

    public class PagedOrganizationServiceProxy : DispatchProxy
    {
        public Dictionary<string, Queue<EntityCollection>> Responses { get; } = [];
        public List<QueryExpression> Queries { get; } = [];

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

            throw new NotSupportedException(targetMethod?.Name);
        }
    }
}
