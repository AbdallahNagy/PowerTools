using System.Text.Json;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using PowerTools.API.Tools.Agent;
using PowerTools.API.Tools.SolutionLayers;
using Xunit;

namespace PowerTools.API.Agent.Tests;

public class AgentSolutionsServiceTests
{
    private static readonly Guid CoreId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid PatchId = Guid.Parse("aaaaaaaa-0000-0000-0000-000000000002");
    private static readonly Guid TableMetadataId = Guid.Parse("eeeeeeee-0000-0000-0000-000000000001");
    private static readonly Guid ColumnMetadataId = Guid.Parse("eeeeeeee-0000-0000-0000-000000000002");

    private static Entity Solution(Guid id, string unique, string version, bool managed = false, Guid? parent = null) =>
        new("solution", id)
        {
            ["uniquename"] = unique,
            ["friendlyname"] = unique + " display",
            ["version"] = version,
            ["ismanaged"] = managed,
            ["publisherid"] = new EntityReference("publisher", Data.ContosoPublisherId) { Name = "Contoso" },
            ["parentsolutionid"] = parent is null ? null : new EntityReference("solution", parent.Value),
        };

    private static (AgentSolutionsService Service, FakeAgentClient Client) Make()
    {
        var client = Data.Client();
        client.Solutions.Clear();
        client.Solutions.Add(Solution(CoreId, "Core", "1.2.3.0"));
        client.Solutions.Add(Solution(PatchId, "Core_Patch", "1.2.5.0", parent: CoreId));
        client.Solutions.Add(Solution(Guid.NewGuid(), "Vendor", "9.0.0.0", managed: true));
        client.OnExecute = request => request switch
        {
            RetrieveEntityRequest => Responses.Of<RetrieveEntityResponse>(("EntityMetadata", new EntityMetadata { MetadataId = TableMetadataId })),
            RetrieveAttributeRequest => Responses.Of<RetrieveAttributeResponse>(("AttributeMetadata", new StringAttributeMetadata { MetadataId = ColumnMetadataId })),
            CloneAsPatchRequest => Responses.Of<CloneAsPatchResponse>(("SolutionId", PatchId), ("UniqueName", "Core_Patch2")),
            CloneAsSolutionRequest => Responses.Of<CloneAsSolutionResponse>(("SolutionId", CoreId)),
            _ => new OrganizationResponse(),
        };
        return (new AgentSolutionsService(client, new SolutionLayersCache(), "test"), client);
    }

    private static JsonElement Json(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static SolutionComponentBody Component(string type, Action<SolutionComponentBody>? configure = null)
    {
        var body = new SolutionComponentBody { Solution = "Core", ComponentType = Json(type) };
        configure?.Invoke(body);
        return body;
    }

    // ── Reads ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task List_returns_solutions_with_patch_flag_and_can_hide_managed_ones()
    {
        var (service, _) = Make();

        var all = await service.ListAsync(false, CancellationToken.None);
        var unmanaged = await service.ListAsync(true, CancellationToken.None);

        Assert.Equal(["Core", "Core_Patch", "Vendor"], all.Value!.Select(s => s.UniqueName).Order());
        Assert.True(all.Value!.Single(s => s.UniqueName == "Core_Patch").IsPatch);
        Assert.False(all.Value!.Single(s => s.UniqueName == "Core").IsPatch);
        Assert.Equal("1.2.3.0", all.Value!.Single(s => s.UniqueName == "Core").Version);
        Assert.Equal("Contoso", all.Value!.Single(s => s.UniqueName == "Core").Publisher);
        Assert.DoesNotContain(unmanaged.Value!, s => s.IsManaged);
    }

    [Fact]
    public async Task List_components_names_types_and_caps_the_result()
    {
        var (service, client) = Make();
        for (var i = 0; i < AgentSolutionsService.MaxComponents + 5; i++)
            client.SolutionComponents.Add(new Entity("solutioncomponent") { ["objectid"] = Guid.NewGuid(), ["componenttype"] = new OptionSetValue(i == 0 ? 1 : 2) });

        var result = await service.ListComponentsAsync("Core", null, CancellationToken.None);

        Assert.Equal(AgentSolutionsService.MaxComponents, result.Value!.Components.Count);
        Assert.True(result.Value.Truncated);
        Assert.Equal(1, result.Value.Components[0].ComponentType);
        Assert.NotNull(result.Value.Components[0].TypeName);
    }

    [Fact]
    public async Task List_components_of_an_unknown_solution_is_not_found()
    {
        var (service, _) = Make();
        var result = await service.ListComponentsAsync("Nope", null, CancellationToken.None);
        Assert.Equal("NotFound", result.Problem!.Code);
    }

    [Fact]
    public async Task Layers_without_a_component_type_is_an_invalid_request()
    {
        var (service, _) = Make();
        var result = await service.GetLayersAsync(null, null, CancellationToken.None);
        Assert.Equal("InvalidRequest", result.Problem!.Code);
    }

    [Fact]
    public async Task Remove_active_layer_needs_a_component_type()
    {
        var (service, client) = Make();
        var result = await service.RemoveActiveLayerAsync(new RemoveActiveLayerBody(), CancellationToken.None);
        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    // ── Create ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_solution_uses_the_publisher_and_a_default_version()
    {
        var (service, client) = Make();
        var id = Guid.NewGuid();
        client.OnCreate = _ => id;

        var result = await service.CreateAsync(new CreateSolutionBody { UniqueName = "Sales", DisplayName = "Sales", Publisher = "new", Description = "d" }, CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal(id, result.Value!.Id);
        Assert.Equal("1.0.0.0", result.Value.Version);
        var entity = Assert.Single(client.Created);
        Assert.Equal("solution", entity.LogicalName);
        Assert.Equal("Sales", entity["uniquename"]);
        Assert.Equal(Data.ContosoPublisherId, entity.GetAttributeValue<EntityReference>("publisherid").Id);
        Assert.Equal("d", entity["description"]);
    }

    [Fact]
    public async Task Create_solution_without_a_publisher_needs_one_and_writes_nothing()
    {
        var (service, client) = Make();

        var result = await service.CreateAsync(new CreateSolutionBody { UniqueName = "Sales", DisplayName = "Sales" }, CancellationToken.None);

        Assert.Equal("PublisherRequired", result.Problem!.Code);
        Assert.Empty(client.Created);
    }

    [Theory]
    [InlineData("bad name", "1.0.0.0")]
    [InlineData("1abc", "1.0.0.0")]
    [InlineData("Sales", "1.0")]
    [InlineData("Core", "1.0.0.0")]
    public async Task Create_solution_rejects_bad_names_versions_and_duplicates(string name, string version)
    {
        var (service, client) = Make();

        var result = await service.CreateAsync(new CreateSolutionBody { UniqueName = name, DisplayName = "x", Publisher = "new", Version = version }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Created);
    }

    // ── Patch and clone ──────────────────────────────────────────────────────

    [Fact]
    public void The_default_patch_version_is_one_build_above_the_parent_and_its_patches()
    {
        Assert.Equal("1.2.4.0", AgentSolutionsService.NextPatchVersion("1.2.3.0", []));
        Assert.Equal("1.2.6.0", AgentSolutionsService.NextPatchVersion("1.2.3.0", ["1.2.5.0", "1.2.4.0"]));
        Assert.Equal("1.2.4.0", AgentSolutionsService.NextPatchVersion("1.2.3.7", ["2.0.9.0"]));
        Assert.Equal("1.0.1.0", AgentSolutionsService.NextPatchVersion("1.0", []));
    }

    [Fact]
    public async Task Create_patch_defaults_the_version_and_display_name_from_the_parent_and_its_patches()
    {
        var (service, client) = Make();

        var result = await service.CreatePatchAsync(new CreatePatchBody { Solution = "Core" }, CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Assert.IsType<CloneAsPatchRequest>(Assert.Single(client.Executed));
        Assert.Equal("Core", request.ParentSolutionUniqueName);
        Assert.Equal("1.2.6.0", request.VersionNumber);
        Assert.Equal("Core display", request.DisplayName);
        Assert.Equal("Core_Patch2", result.Value!.UniqueName);
    }

    [Fact]
    public async Task Create_patch_uses_a_given_version_and_display_name()
    {
        var (service, client) = Make();

        await service.CreatePatchAsync(new CreatePatchBody { Solution = "Core", Version = "1.2.9.0", DisplayName = "Hotfix" }, CancellationToken.None);

        var request = Assert.IsType<CloneAsPatchRequest>(Assert.Single(client.Executed));
        Assert.Equal("1.2.9.0", request.VersionNumber);
        Assert.Equal("Hotfix", request.DisplayName);
    }

    [Theory]
    [InlineData("Nope", "NotFound")]
    [InlineData("Vendor", "InvalidRequest")]
    [InlineData("Core_Patch", "InvalidRequest")]
    public async Task Create_patch_refuses_unknown_managed_and_patch_parents(string solution, string code)
    {
        var (service, client) = Make();

        var result = await service.CreatePatchAsync(new CreatePatchBody { Solution = solution }, CancellationToken.None);

        Assert.Equal(code, result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task Clone_builds_a_clone_as_solution_request()
    {
        var (service, client) = Make();

        var result = await service.CloneAsync(new CloneSolutionBody { Solution = "Core", Version = "2.0.0.0", DisplayName = "Core v2" }, CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Assert.IsType<CloneAsSolutionRequest>(Assert.Single(client.Executed));
        Assert.Equal(("Core", "2.0.0.0", "Core v2"), (request.ParentSolutionUniqueName, request.VersionNumber, request.DisplayName));
    }

    [Theory]
    [InlineData("Core", null)]
    [InlineData("Core", "2.0")]
    [InlineData("Core_Patch", "2.0.0.0")]
    [InlineData("Nope", "2.0.0.0")]
    public async Task Clone_refuses_a_missing_or_bad_version_a_patch_and_an_unknown_solution(string solution, string? version)
    {
        var (service, client) = Make();

        var result = await service.CloneAsync(new CloneSolutionBody { Solution = solution, Version = version }, CancellationToken.None);

        Assert.NotNull(result.Problem);
        Assert.Empty(client.Executed);
    }

    // ── Components ───────────────────────────────────────────────────────────

    [Theory]
    [InlineData("\"form\"", 60)]
    [InlineData("\"VIEW\"", 26)]
    [InlineData("\"pluginassembly\"", 91)]
    [InlineData("\"pluginstep\"", 92)]
    [InlineData("\"envvar\"", 380)]
    [InlineData("29", 29)]
    public async Task Add_component_maps_type_names_and_numbers(string type, int expected)
    {
        var (service, client) = Make();
        var id = Guid.NewGuid();

        var result = await service.AddComponentAsync(Component(type, b => b.ComponentId = id.ToString()), CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Assert.IsType<AddSolutionComponentRequest>(Assert.Single(client.Executed));
        Assert.Equal((id, expected, "Core", false), (request.ComponentId, request.ComponentType, request.SolutionUniqueName, request.AddRequiredComponents));
    }

    [Fact]
    public async Task Add_component_resolves_a_table_and_a_column_to_their_metadata_ids()
    {
        var (service, client) = Make();

        await service.AddComponentAsync(Component("\"table\"", b => b.Table = "Account"), CancellationToken.None);
        await service.AddComponentAsync(Component("\"column\"", b => { b.Table = "account"; b.Column = "new_x"; b.AddRequiredComponents = true; }), CancellationToken.None);

        var adds = client.Executed.OfType<AddSolutionComponentRequest>().ToList();
        Assert.Equal((TableMetadataId, 1, false), (adds[0].ComponentId, adds[0].ComponentType, adds[0].AddRequiredComponents));
        Assert.Equal((ColumnMetadataId, 2, true), (adds[1].ComponentId, adds[1].ComponentType, adds[1].AddRequiredComponents));
        Assert.Equal("account", client.Executed.OfType<RetrieveEntityRequest>().Single().LogicalName);
    }

    [Fact]
    public async Task Add_component_to_an_unknown_solution_is_not_found_and_writes_nothing()
    {
        var (service, client) = Make();

        var result = await service.AddComponentAsync(Component("\"form\"", b => { b.Solution = "Nope"; b.ComponentId = Guid.NewGuid().ToString(); }), CancellationToken.None);

        Assert.Equal("NotFound", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    [Theory]
    [InlineData("\"nonsense\"", null)]
    [InlineData("0", null)]
    [InlineData("\"form\"", null)]
    [InlineData("\"form\"", "not-a-guid")]
    [InlineData("\"column\"", null)]
    public async Task Add_component_refuses_a_bad_type_or_a_missing_or_bad_id(string type, string? componentId)
    {
        var (service, client) = Make();

        var result = await service.AddComponentAsync(Component(type, b => b.ComponentId = componentId), CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(client.Executed);
    }

    [Fact]
    public async Task Remove_component_builds_a_remove_solution_component_request()
    {
        var (service, client) = Make();
        var id = Guid.NewGuid();

        var result = await service.RemoveComponentAsync(Component("\"view\"", b => b.ComponentId = id.ToString()), CancellationToken.None);

        Assert.Null(result.Problem);
        var request = Assert.IsType<RemoveSolutionComponentRequest>(Assert.Single(client.Executed));
        Assert.Equal((id, 26, "Core"), (request.ComponentId, request.ComponentType, request.SolutionUniqueName));
    }

    [Fact]
    public async Task Delete_solution_deletes_an_unmanaged_solution_and_refuses_managed_and_system_ones()
    {
        var (service, client) = Make();
        client.Solutions.Add(new Entity("solution", Guid.NewGuid()) { ["uniquename"] = "Default", ["ismanaged"] = false, ["isvisible"] = false });

        var deleted = await service.DeleteAsync(new DeleteSolutionBody { Solution = "Core" }, CancellationToken.None);
        var managed = await service.DeleteAsync(new DeleteSolutionBody { Solution = "Vendor" }, CancellationToken.None);
        var system = await service.DeleteAsync(new DeleteSolutionBody { Solution = "Default" }, CancellationToken.None);
        var missing = await service.DeleteAsync(new DeleteSolutionBody { Solution = "Nope" }, CancellationToken.None);

        Assert.Null(deleted.Problem);
        Assert.Equal(("Core", CoreId), (deleted.Value!.UniqueName, deleted.Value.Id));
        Assert.Equal([("solution", CoreId)], client.Deleted);
        Assert.Equal("InvalidRequest", managed.Problem!.Code);
        Assert.Equal("InvalidRequest", system.Problem!.Code);
        Assert.Equal("NotFound", missing.Problem!.Code);
    }

    [Fact]
    public async Task Create_patch_reports_the_name_dataverse_gave_the_patch()
    {
        var (service, client) = Make();
        client.Records[("solution", PatchId)] = new Entity("solution", PatchId) { ["uniquename"] = "Core_Patch_aaaaaaaa" };

        var result = await service.CreatePatchAsync(new CreatePatchBody { Solution = "Core" }, CancellationToken.None);

        Assert.Equal("Core_Patch_aaaaaaaa", result.Value!.UniqueName);
    }

    [Fact]
    public async Task Components_are_named_by_number_or_by_the_environments_component_definitions()
    {
        var (service, client) = Make();
        client.SolutionComponents.Add(new Entity("solutioncomponent") { ["objectid"] = Guid.NewGuid(), ["componenttype"] = new OptionSetValue(80) });
        client.SolutionComponents.Add(new Entity("solutioncomponent") { ["objectid"] = Guid.NewGuid(), ["componenttype"] = new OptionSetValue(10088) });
        client.SolutionComponents.Add(new Entity("solutioncomponent") { ["objectid"] = Guid.NewGuid(), ["componenttype"] = new OptionSetValue(10999) });
        client.ByEntity["solutioncomponentdefinition"] = [new Entity("solutioncomponentdefinition") { ["name"] = "AppSetting", ["solutioncomponenttype"] = 10088 }];

        var result = await service.ListComponentsAsync("Core", null, CancellationToken.None);

        Assert.Equal(["AppModule", "AppSetting", null], result.Value!.Components.Select(c => c.TypeName));
    }
}
