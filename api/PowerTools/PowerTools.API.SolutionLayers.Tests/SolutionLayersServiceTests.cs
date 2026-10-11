using System.ServiceModel;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using PowerTools.API.Tools.SolutionLayers;
using Xunit;

namespace PowerTools.API.SolutionLayers.Tests;

public sealed class FakeSolutionLayersClient : ISolutionLayersClient
{
    public List<QueryBase> Queries { get; } = [];
    public List<OrganizationRequest> Requests { get; } = [];
    public Func<QueryExpression, EntityCollection>? OnRetrieve { get; set; }
    public Func<OrganizationRequest, OrganizationResponse>? OnExecute { get; set; }

    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken)
    {
        Queries.Add(query);
        var expression = Assert.IsType<QueryExpression>(query);
        return Task.FromResult(OnRetrieve?.Invoke(expression) ?? new EntityCollection());
    }

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken)
    {
        Requests.Add(request);
        return Task.FromResult(OnExecute?.Invoke(request) ?? new OrganizationResponse());
    }

    public IEnumerable<QueryExpression> LayerQueries =>
        Queries.OfType<QueryExpression>().Where(query => query.EntityName == SolutionLayersQueries.LayerTable);
}

public sealed class SolutionLayersServiceTests
{
    private static readonly Guid ComponentId = Guid.Parse("8f1d6a2c-1b2e-4c3d-9e4f-5a6b7c8d9e0f");

    private static SolutionLayersService Service(FakeSolutionLayersClient client) =>
        new(client, new SolutionLayersCache(), "https://dev.example.test");

    private static Entity Layer(
        string solution,
        int order,
        string? componentId = null,
        string? json = null,
        string? version = null,
        string layerName = "WebResource")
    {
        var entity = new Entity(SolutionLayersQueries.LayerTable, Guid.NewGuid())
        {
            ["msdyn_solutionname"] = solution,
            ["msdyn_order"] = order,
            ["msdyn_componentid"] = componentId ?? ComponentId.ToString("D"),
            ["msdyn_solutioncomponentname"] = layerName,
            ["msdyn_publishername"] = solution == "Active" ? "" : "Contoso",
            ["msdyn_name"] = "new_/scripts/main.js",
            ["msdyn_overwritetime"] = new DateTime(2026, 3, 4, 5, 6, 7, DateTimeKind.Utc),
            ["msdyn_componentjson"] = json ?? "{\"Attributes\":[]}",
            ["msdyn_changes"] = "{\"Attributes\":[]}",
        };
        if (version is not null) entity["msdyn_solutionversion"] = version;
        return entity;
    }

    private static FakeSolutionLayersClient WithLayers(params Entity[] layers) =>
        new()
        {
            OnRetrieve = query => query.EntityName == SolutionLayersQueries.LayerTable
                ? new EntityCollection(layers.ToList())
                : new EntityCollection(),
        };

    private static FaultException<OrganizationServiceFault> Fault(int code, string message) =>
        new(new OrganizationServiceFault { ErrorCode = code, Message = message }, new FaultReason(message));

    [Fact]
    public void Classic_types_map_to_their_layer_names()
    {
        Assert.Equal("Entity", ComponentLayerNames.LayerName(1, null));
        Assert.Equal("Attribute", ComponentLayerNames.LayerName(2, null));
        Assert.Equal("SystemForm", ComponentLayerNames.LayerName(60, null));
        Assert.Equal("SavedQuery", ComponentLayerNames.LayerName(26, null));
        Assert.Equal("WebResource", ComponentLayerNames.LayerName(61, null));
        Assert.Equal("CanvasApp", ComponentLayerNames.LayerName(300, null));
        Assert.Null(ComponentLayerNames.LayerName(80, null));
        Assert.Null(ComponentLayerNames.LayerName(10123, null));
    }

    [Fact]
    public void Model_driven_apps_and_newer_types_resolve_from_definitions()
    {
        var definitions = new[]
        {
            new ComponentDefinition(80, "appmodule", "appmodule"),
            new ComponentDefinition(10123, "msdyn_aiconfiguration", "msdyn_aiconfiguration"),
        };

        Assert.Equal("AppModule", ComponentLayerNames.LayerName(80, definitions));
        Assert.Equal("msdyn_aiconfiguration", ComponentLayerNames.LayerName(10123, definitions));
        var labels = ComponentLayerNames.Searchable(definitions).Select(type => type.Label).ToArray();
        Assert.Equal(
            [
                "Table", "Column", "Choice", "Relationship", "Security role", "Form", "View", "Chart",
                "Web resource", "Process", "Model-driven app", "Plug-in assembly", "Plug-in step", "Canvas app",
            ],
            labels);
        Assert.DoesNotContain("Model-driven app", ComponentLayerNames.Searchable(null).Select(type => type.Label));
    }

    [Fact]
    public void Layer_query_filters_by_both_columns_without_paging_or_order()
    {
        var query = SolutionLayersQueries.ComponentLayers("WebResource", ComponentId);

        Assert.Equal("msdyn_componentlayer", query.EntityName);
        Assert.True(query.ColumnSet.AllColumns);
        Assert.False(query.NoLock);
        Assert.Null(query.TopCount);
        Assert.Empty(query.Orders);
        Assert.Equal(0, query.PageInfo.Count);
        var id = Assert.Single(query.Criteria.Conditions, condition => condition.AttributeName == "msdyn_componentid");
        Assert.Equal(ConditionOperator.Equal, id.Operator);
        Assert.Equal(ComponentId.ToString("D"), Assert.IsType<string>(id.Values[0]));
        var name = Assert.Single(query.Criteria.Conditions, condition => condition.AttributeName == "msdyn_solutioncomponentname");
        Assert.Equal("WebResource", name.Values[0]);
    }

    [Fact]
    public async Task No_layer_rows_return_an_empty_list_that_cannot_be_removed()
    {
        var result = await Service(WithLayers()).GetLayersAsync(61, ComponentId.ToString(), CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Empty(result.Value!.Layers);
        Assert.False(result.Value.HasActiveLayer);
        Assert.False(result.Value.CanRemoveActive);
        Assert.Equal("WebResource", result.Value.LayerName);
    }

    [Fact]
    public async Task Active_only_component_is_not_removable()
    {
        var result = await Service(WithLayers(Layer("Active", 1))).GetLayersAsync(61, ComponentId.ToString(), CancellationToken.None);

        Assert.True(result.Value!.HasActiveLayer);
        Assert.False(result.Value.CanRemoveActive);
    }

    [Fact]
    public async Task Managed_and_active_layers_are_sorted_active_first_then_by_order_descending()
    {
        var client = WithLayers(
            Layer("System", 0, version: "1.0.0.0"),
            Layer("active", 3, version: "ignored"),
            Layer("ContosoCore", 1, version: "1.2.0.0"),
            Layer("ContosoPatch", 2, version: "1.2.1.0"));

        var result = await Service(client).GetLayersAsync(61, ComponentId.ToString().ToUpperInvariant(), CancellationToken.None);

        var layers = result.Value!.Layers;
        Assert.Equal(["active", "ContosoPatch", "ContosoCore", "System"], layers.Select(layer => layer.SolutionName).ToArray());
        Assert.True(layers[0].IsActive);
        Assert.Null(layers[0].SolutionVersion);
        Assert.Equal("1.2.1.0", layers[1].SolutionVersion);
        Assert.Equal("2026-03-04T05:06:07.000Z", layers[1].OverwriteTime);
        Assert.True(result.Value.CanRemoveActive);
    }

    [Fact]
    public async Task Rows_for_another_component_id_are_dropped_and_ids_match_case_insensitively()
    {
        var client = WithLayers(
            Layer("Active", 2, componentId: ComponentId.ToString("D").ToUpperInvariant()),
            Layer("Other", 1, componentId: Guid.NewGuid().ToString("D")));

        var result = await Service(client).GetLayersAsync(61, ComponentId.ToString(), CancellationToken.None);

        Assert.Equal(["Active"], result.Value!.Layers.Select(layer => layer.SolutionName).ToArray());
    }

    [Fact]
    public async Task Malformed_json_is_passed_through_unchanged()
    {
        var client = WithLayers(Layer("Active", 1, json: "{not json"));

        var result = await Service(client).GetLayersAsync(61, ComponentId.ToString(), CancellationToken.None);

        Assert.Equal("{not json", Assert.Single(result.Value!.Layers).ComponentJson);
    }

    [Fact]
    public async Task Invalid_ids_and_unknown_types_are_refused_before_any_call()
    {
        var client = WithLayers();
        var service = Service(client);

        var badId = await service.GetLayersAsync(61, "not-a-guid", CancellationToken.None);
        var unknown = await service.GetLayersAsync(424242, ComponentId.ToString(), CancellationToken.None);

        Assert.Equal(400, badId.Problem!.Status);
        Assert.Equal(422, unknown.Problem!.Status);
        Assert.Empty(client.LayerQueries);
    }

    [Fact]
    public async Task Missing_layer_table_maps_to_not_supported()
    {
        var client = new FakeSolutionLayersClient
        {
            OnRetrieve = _ => throw Fault(SolutionLayersFaults.QueryBuilderNoEntity, "The entity msdyn_componentlayer does not exist."),
        };

        var result = await Service(client).GetLayersAsync(61, ComponentId.ToString(), CancellationToken.None);

        Assert.Equal(501, result.Problem!.Status);
        Assert.Equal("layers_not_supported", result.Problem.Code);
    }

    [Fact]
    public async Task Read_privilege_fault_maps_to_403()
    {
        var client = new FakeSolutionLayersClient
        {
            OnRetrieve = _ => throw Fault(SolutionLayersFaults.PrivilegeDenied, "Principal user is missing prvReadmsdyn_componentlayer."),
        };

        var result = await Service(client).GetLayersAsync(61, ComponentId.ToString(), CancellationToken.None);

        Assert.Equal(403, result.Problem!.Status);
        Assert.Contains("prvReadmsdyn_componentlayer", result.Problem.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Remove_is_refused_with_409_when_there_is_no_active_layer()
    {
        var client = WithLayers(Layer("ContosoCore", 1));

        var result = await Service(client).RemoveActiveAsync(new RemoveActiveBody(61, ComponentId.ToString()), CancellationToken.None);

        Assert.Equal(409, result.Problem!.Status);
        Assert.Equal(SolutionLayersFaults.NoActiveLayerCode, result.Problem.Code);
        Assert.Empty(client.Requests);
    }

    [Fact]
    public async Task Remove_is_refused_with_409_when_the_active_layer_is_the_only_layer()
    {
        var client = WithLayers(Layer("Active", 1));

        var result = await Service(client).RemoveActiveAsync(new RemoveActiveBody(61, ComponentId.ToString()), CancellationToken.None);

        Assert.Equal(409, result.Problem!.Status);
        Assert.Equal(SolutionLayersFaults.OnlyActiveLayerCode, result.Problem.Code);
        Assert.Empty(client.Requests);
    }

    [Fact]
    public async Task Remove_sends_one_request_and_returns_the_refreshed_layers()
    {
        var removed = false;
        var client = new FakeSolutionLayersClient
        {
            OnRetrieve = query =>
            {
                Assert.Equal(SolutionLayersQueries.LayerTable, query.EntityName);
                return removed
                    ? new EntityCollection([Layer("ContosoCore", 1)])
                    : new EntityCollection([Layer("Active", 2, layerName: "WebResource"), Layer("ContosoCore", 1)]);
            },
            OnExecute = _ =>
            {
                removed = true;
                return new OrganizationResponse();
            },
        };

        var result = await Service(client).RemoveActiveAsync(new RemoveActiveBody(61, ComponentId.ToString()), CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Assert.Single(client.Requests);
        Assert.Equal("RemoveActiveCustomizations", request.RequestName);
        Assert.Equal("WebResource", request["SolutionComponentName"]);
        Assert.Equal(ComponentId, Assert.IsType<Guid>(request["ComponentId"]));
        Assert.Equal(2, client.LayerQueries.Count());
        Assert.False(result.Value!.HasActiveLayer);
        Assert.Equal(["ContosoCore"], result.Value.Layers.Select(layer => layer.SolutionName).ToArray());
    }

    [Theory]
    [InlineData(unchecked((int)0x80040220), 403, "PrivilegeDenied")]
    [InlineData(unchecked((int)0x8004F077), 409, "CustomizationLocked")]
    [InlineData(unchecked((int)0x8004F076), 409, "NotActiveLayer")]
    [InlineData(unchecked((int)0x8004F059), 422, "RemoveNotSupported")]
    [InlineData(unchecked((int)0x8004F075), 422, "RemoveFailedForEntity")]
    [InlineData(unchecked((int)0x80040203), 422, "DataverseFault")]
    [InlineData(unchecked((int)0x80072322), 429, "ServiceProtection")]
    public async Task Remove_faults_map_to_problems_with_the_dataverse_message(int code, int status, string problemCode)
    {
        var client = WithLayers(Layer("Active", 2), Layer("ContosoCore", 1));
        client.OnExecute = _ => throw Fault(code, "Dataverse said no.");

        var result = await Service(client).RemoveActiveAsync(new RemoveActiveBody(61, ComponentId.ToString()), CancellationToken.None);

        Assert.Equal(status, result.Problem!.Status);
        Assert.Equal(problemCode, result.Problem.Code);
        Assert.Contains("Dataverse said no.", result.Problem.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Remove_timeout_rereads_the_layers_instead_of_retrying()
    {
        var client = WithLayers(Layer("Active", 2), Layer("ContosoCore", 1));
        client.OnExecute = _ => throw new TimeoutException("The request channel timed out.");

        var result = await Service(client).RemoveActiveAsync(new RemoveActiveBody(61, ComponentId.ToString()), CancellationToken.None);

        Assert.Single(client.Requests);
        Assert.Equal(2, client.LayerQueries.Count());
        Assert.Equal(504, result.Problem!.Status);
    }

    [Fact]
    public async Task Component_types_fall_back_to_documented_types_when_definitions_fail()
    {
        var client = new FakeSolutionLayersClient
        {
            OnRetrieve = _ => throw Fault(unchecked((int)0x80041103), "Unknown column."),
        };

        var result = await Service(client).GetComponentTypesAsync(CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal(13, result.Value!.ComponentTypes.Count);
        Assert.DoesNotContain(result.Value.ComponentTypes, type => type.Name == "AppModule");
    }

    [Fact]
    public async Task Component_types_add_model_driven_apps_from_definitions_and_cache_them()
    {
        var client = new FakeSolutionLayersClient
        {
            OnRetrieve = query =>
            {
                Assert.Equal("solutioncomponentdefinition", query.EntityName);
                return new EntityCollection(
                [
                    new Entity("solutioncomponentdefinition", Guid.NewGuid())
                    {
                        ["name"] = "appmodule",
                        ["solutioncomponenttype"] = 80,
                        ["primaryentityname"] = "appmodule",
                    },
                ]);
            },
        };
        var service = Service(client);

        var first = await service.GetComponentTypesAsync(CancellationToken.None);
        await service.GetComponentTypesAsync(CancellationToken.None);

        var app = Assert.Single(first.Value!.ComponentTypes, type => type.Name == "AppModule");
        Assert.Equal(80, app.ComponentType);
        Assert.Equal("Model-driven app", app.Label);
        Assert.Single(client.Queries);
    }

    [Fact]
    public async Task Table_search_is_bounded_escaped_and_reports_truncation()
    {
        var rows = Enumerable.Range(0, 51)
            .Select(index => new Entity("webresource", Guid.NewGuid())
            {
                ["name"] = $"new_/scripts/{index:D2}.js",
                ["displayname"] = $"Script {index:D2}",
            })
            .ToList();
        var client = new FakeSolutionLayersClient
        {
            OnRetrieve = query => query.EntityName == "webresource" ? new EntityCollection(rows) : new EntityCollection(),
        };

        var result = await Service(client).SearchComponentsAsync(61, "new_%", null, CancellationToken.None);

        var query = Assert.Single(client.Queries.OfType<QueryExpression>(), item => item.EntityName == "webresource");
        Assert.Equal(51, query.TopCount);
        var text = Assert.Single(query.Criteria.Filters);
        Assert.Equal(LogicalOperator.Or, text.FilterOperator);
        Assert.All(text.Conditions, condition => Assert.Equal("%new[_][%]%", condition.Values[0]));
        Assert.Equal(50, result.Value!.Components.Count);
        Assert.True(result.Value.Truncated);
        Assert.Equal("Script 00", result.Value.Components[0].Name);
        Assert.Equal("new_/scripts/00.js", result.Value.Components[0].LogicalName);
    }

    [Fact]
    public async Task Form_search_filters_by_table_and_view_search_by_returned_type()
    {
        var client = new FakeSolutionLayersClient();
        var service = Service(client);

        await service.SearchComponentsAsync(60, "", "account", CancellationToken.None);
        await service.SearchComponentsAsync(26, "active", "contact", CancellationToken.None);

        var form = client.Queries.OfType<QueryExpression>().Single(query => query.EntityName == "systemform");
        Assert.Contains(form.Criteria.Conditions, condition => condition.AttributeName == "objecttypecode" && (string)condition.Values[0] == "account");
        Assert.Empty(form.Criteria.Filters);
        var view = client.Queries.OfType<QueryExpression>().Single(query => query.EntityName == "savedquery");
        Assert.Contains(view.Criteria.Conditions, condition => condition.AttributeName == "returnedtypecode" && (string)condition.Values[0] == "contact");
    }

    [Fact]
    public async Task Column_search_requires_a_table()
    {
        var result = await Service(new FakeSolutionLayersClient()).SearchComponentsAsync(2, "", null, CancellationToken.None);

        Assert.Equal(400, result.Problem!.Status);
        Assert.Equal("TableRequired", result.Problem.Code);
    }

    [Fact]
    public async Task Column_search_returns_attribute_metadata_ids_and_skips_virtual_name_columns()
    {
        var name = new StringAttributeMetadata { LogicalName = "name", MetadataId = Guid.NewGuid() };
        var owner = new LookupAttributeMetadata { LogicalName = "owneridname", MetadataId = Guid.NewGuid() };
        Metadata.SetInternal(owner, nameof(AttributeMetadata.AttributeOf), "ownerid");
        var table = new EntityMetadata { LogicalName = "account" };
        Metadata.SetInternal(table, nameof(EntityMetadata.Attributes), new AttributeMetadata[] { name, owner });
        var client = new FakeSolutionLayersClient
        {
            OnExecute = request =>
            {
                Assert.IsType<RetrieveMetadataChangesRequest>(request);
                var response = new RetrieveMetadataChangesResponse();
                response.Results["EntityMetadata"] = new EntityMetadataCollection { table };
                return response;
            },
        };

        var result = await Service(client).SearchComponentsAsync(2, "", "account", CancellationToken.None);

        var column = Assert.Single(result.Value!.Components);
        Assert.Equal(name.MetadataId!.Value.ToString("D"), column.ComponentId);
        Assert.Equal("account", column.ParentEntity);
    }

    [Fact]
    public async Task Table_search_filters_entity_metadata_in_memory()
    {
        var account = new EntityMetadata { LogicalName = "account", MetadataId = Guid.NewGuid() };
        var contact = new EntityMetadata { LogicalName = "contact", MetadataId = Guid.NewGuid() };
        var client = new FakeSolutionLayersClient
        {
            OnExecute = _ =>
            {
                var response = new RetrieveMetadataChangesResponse();
                response.Results["EntityMetadata"] = new EntityMetadataCollection { contact, account };
                return response;
            },
        };

        var result = await Service(client).SearchComponentsAsync(1, "CONT", null, CancellationToken.None);

        Assert.Equal(["contact"], result.Value!.Components.Select(component => component.LogicalName).ToArray());
        Assert.False(result.Value.Truncated);
    }
}

internal static class Metadata
{
    public static void SetInternal(object target, string property, object? value)
    {
        for (var type = target.GetType(); type is not null; type = type.BaseType)
        {
            var info = type.GetProperty(
                property,
                System.Reflection.BindingFlags.Instance
                | System.Reflection.BindingFlags.Public
                | System.Reflection.BindingFlags.NonPublic
                | System.Reflection.BindingFlags.DeclaredOnly);
            if (info?.SetMethod is not null)
            {
                info.SetValue(target, value);
                return;
            }
        }

        throw new InvalidOperationException($"No settable property {property} on {target.GetType().Name}.");
    }
}
