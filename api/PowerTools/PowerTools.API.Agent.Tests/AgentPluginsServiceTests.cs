using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Tools.Agent;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Inspection;
using PowerTools.API.Tools.PluginRegistration.Services;
using Xunit;

namespace PowerTools.API.Agent.Tests;

internal sealed class FakeInspector : IPluginAssemblyInspector
{
    public List<byte[]> Seen { get; } = [];
    public string Name { get; set; } = "Contoso.Plugins";

    public Task<AssemblyInspectionDto> InspectAsync(Stream assembly, string fileName, long length, CancellationToken cancellationToken)
    {
        using var copy = new MemoryStream();
        assembly.CopyTo(copy);
        Seen.Add(copy.ToArray());
        return Task.FromResult(new AssemblyInspectionDto(
            fileName, length, "sha", new AssemblyIdentityInspectionDto(Name, "1.2.3.4", "neutral", "d2997b4d969e30c1"),
            "net462", "v4.0", [], [new PluginTypeInspectionDto("Contoso.Plugins.AccountPlugin")], []));
    }
}

public class AgentPluginsServiceTests
{
    private static readonly byte[] Dll = [0x4D, 0x5A, 1, 2, 3, 4, 5];
    private static readonly string Base64 = Convert.ToBase64String(Dll);
    private static readonly Guid AssemblyId = Guid.Parse("aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa");
    private static readonly Guid TypeId = Guid.Parse("bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb");
    private static readonly Guid StepId = Guid.Parse("cccccccc-1111-1111-1111-cccccccccccc");

    private static (AgentPluginsService Service, FakeAgentClient Client, FakeInspector Inspector) Make(bool online = true)
    {
        var client = Data.Client();
        var inspector = new FakeInspector();
        client.OnCreate = entity => entity.LogicalName == "pluginassembly" ? AssemblyId : Guid.NewGuid();
        return (new AgentPluginsService(client, inspector, online), client, inspector);
    }

    private static Entity Row(string table, Guid id, params (string, object?)[] values)
    {
        var entity = new Entity(table, id);
        foreach (var (key, value) in values) entity[key] = value;
        return entity;
    }

    // ── Assemblies ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Register_assembly_decodes_the_bytes_inspects_them_and_creates_the_assembly_and_its_types()
    {
        var (service, client, inspector) = Make();

        var result = await service.RegisterAssemblyAsync(new RegisterAssemblyBody { FileName = @"C:\temp\Contoso.Plugins.dll", ContentBase64 = Base64 }, CancellationToken.None);

        Assert.Null(result.Problem);
        Assert.Equal(AssemblyId, result.Value!.Id);
        Assert.Equal(Dll, Assert.Single(inspector.Seen).Take(Dll.Length).ToArray());
        var assembly = Assert.Single(client.Created, e => e.LogicalName == "pluginassembly");
        Assert.Equal(Base64, assembly["content"]);
        Assert.Equal(2, assembly.GetAttributeValue<OptionSetValue>("isolationmode").Value);
        Assert.Equal(0, assembly.GetAttributeValue<OptionSetValue>("sourcetype").Value);
        Assert.Equal("Contoso.Plugins", assembly["name"]);
        Assert.Contains(client.Created, e => e.LogicalName == "plugintype" && (string)e["typename"] == "Contoso.Plugins.AccountPlugin");
        Assert.Empty(client.Executed.OfType<AddSolutionComponentRequest>());
    }

    [Fact]
    public async Task Register_assembly_adds_it_to_the_solution_when_given()
    {
        var (service, client, _) = Make();

        await service.RegisterAssemblyAsync(new RegisterAssemblyBody { FileName = "a.dll", ContentBase64 = Base64, Solution = "Core" }, CancellationToken.None);

        var add = Assert.Single(client.Executed.OfType<AddSolutionComponentRequest>());
        Assert.Equal((AssemblyId, 91, "Core", false), (add.ComponentId, add.ComponentType, add.SolutionUniqueName, add.AddRequiredComponents));
    }

    [Fact]
    public async Task Register_assembly_is_undone_when_it_cannot_be_added_to_the_solution()
    {
        var (service, client, _) = Make();
        client.OnExecute = request => request is AddSolutionComponentRequest
            ? throw FakeAgentClient.Fault(unchecked((int)0x80048538), "Cannot modify solution because it has patches.")
            : new OrganizationResponse();

        var result = await service.RegisterAssemblyAsync(
            new RegisterAssemblyBody { FileName = "a.dll", ContentBase64 = Base64, Solution = "Core" }, CancellationToken.None);

        Assert.NotNull(result.Problem);
        Assert.Contains("patches", result.Problem!.Message);
        Assert.Equal([("pluginassembly", AssemblyId)], client.Deleted);
    }

    [Fact]
    public async Task The_agent_path_creates_the_same_assembly_as_the_stream_path_of_the_existing_service()
    {
        var (service, agentClient, _) = Make();
        await service.RegisterAssemblyAsync(new RegisterAssemblyBody { FileName = "a.dll", ContentBase64 = Base64 }, CancellationToken.None);

        var (_, directClient, directInspector) = Make();
        await using var stream = new MemoryStream(Dll);
        await new AssemblyService(new AgentPluginGateway(directClient), directInspector).RegisterAsync(
            stream, "a.dll", Dll.Length, new AssemblyRegisterRequest(2, 0), CapabilitiesService.For(true), CancellationToken.None);

        Assert.Equal(
            directClient.Created.Select(Describe),
            agentClient.Created.Select(Describe));
    }

    private static string Describe(Entity entity) =>
        entity.LogicalName + ":" + string.Join(",", entity.Attributes.OrderBy(a => a.Key).Select(a => $"{a.Key}={Format(a.Value)}"));

    private static string Format(object? value) => value switch
    {
        OptionSetValue option => option.Value.ToString(),
        EntityReference reference => $"{reference.LogicalName}:{reference.Id}",
        _ => value?.ToString() ?? "",
    };

    [Theory]
    [InlineData("", "AAAA")]
    [InlineData("a.dll", "")]
    [InlineData("a.dll", "not base64!!")]
    public async Task Register_assembly_refuses_missing_or_bad_input_without_inspecting(string name, string content)
    {
        var (service, client, inspector) = Make();

        var result = await service.RegisterAssemblyAsync(new RegisterAssemblyBody { FileName = name, ContentBase64 = content }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Empty(inspector.Seen);
        Assert.Empty(client.Created);
    }

    [Fact]
    public async Task Register_assembly_refuses_more_than_16_megabytes_before_decoding()
    {
        var (service, _, inspector) = Make();
        var tooBig = new string('A', (int)(AgentPluginsService.MaxAssemblyBytes / 3 * 4) + 400);

        var result = await service.RegisterAssemblyAsync(new RegisterAssemblyBody { FileName = "a.dll", ContentBase64 = tooBig }, CancellationToken.None);

        Assert.Equal("InvalidRequest", result.Problem!.Code);
        Assert.Contains("16 MB", result.Problem.Message);
        Assert.Empty(inspector.Seen);
    }

    [Fact]
    public async Task Update_assembly_of_an_unknown_id_is_not_found()
    {
        var (service, _, inspector) = Make();

        var result = await service.UpdateAssemblyAsync(Guid.NewGuid(), new UpdateAssemblyBody { FileName = "a.dll", ContentBase64 = Base64 }, CancellationToken.None);

        Assert.Equal("NotFound", result.Problem!.Code);
        Assert.Empty(inspector.Seen);
    }

    [Fact]
    public async Task Update_assembly_replaces_the_content_of_a_matching_assembly()
    {
        var (service, client, _) = Make();
        client.Records[("pluginassembly", AssemblyId)] = Row("pluginassembly", AssemblyId,
            ("name", "Contoso.Plugins"), ("publickeytoken", "d2997b4d969e30c1"), ("version", "1.2.0.0"), ("culture", "neutral"),
            ("isolationmode", new OptionSetValue(2)), ("sourcetype", new OptionSetValue(0)), ("customizationlevel", 1), ("ismanaged", false));

        var result = await service.UpdateAssemblyAsync(AssemblyId, new UpdateAssemblyBody { FileName = "a.dll", ContentBase64 = Base64 }, CancellationToken.None);

        Assert.Null(result.Problem);
        var update = Assert.Single(client.Updated);
        Assert.Equal(Base64, update["content"]);
    }

    // ── Steps, images, unregister ────────────────────────────────────────────

    [Fact]
    public async Task Step_state_needs_enabled_and_unregister_needs_a_known_kind()
    {
        var (service, client, _) = Make();

        var state = await service.SetStepStateAsync(StepId, new StepStateBody(), CancellationToken.None);
        var kind = await service.UnregisterAsync(new UnregisterBody { Kind = "nonsense", Id = StepId }, CancellationToken.None);

        Assert.Equal("InvalidRequest", state.Problem!.Code);
        Assert.Equal("InvalidRequest", kind.Problem!.Code);
        Assert.Empty(client.Updated);
        Assert.Empty(client.Deleted);
    }

    [Fact]
    public async Task Set_step_state_updates_state_and_status_of_a_writable_step()
    {
        var (service, client, _) = Make();
        client.Records[("sdkmessageprocessingstep", StepId)] = Row("sdkmessageprocessingstep", StepId, ("customizationlevel", 1), ("ismanaged", false));

        var result = await service.SetStepStateAsync(StepId, new StepStateBody { Enabled = false }, CancellationToken.None);

        Assert.Null(result.Problem);
        var update = Assert.Single(client.Updated);
        Assert.Equal(1, update.GetAttributeValue<OptionSetValue>("statecode").Value);
    }

    [Fact]
    public async Task Create_step_with_an_unknown_message_is_not_found_and_creates_nothing()
    {
        var (service, client, _) = Make();

        var result = await service.CreateStepAsync(new StepBody { Name = "", PluginTypeId = TypeId }, CancellationToken.None);

        Assert.Equal("NotFound", result.Problem!.Code);
        Assert.Empty(client.Created);
    }

    [Fact]
    public async Task Unregister_an_unknown_step_is_not_found_and_deletes_nothing()
    {
        var (service, client, _) = Make();

        var result = await service.UnregisterAsync(new UnregisterBody { Kind = "step", Id = StepId }, CancellationToken.None);

        Assert.Equal("NotFound", result.Problem!.Code);
        Assert.Empty(client.Deleted);
    }

    // ── Catalog ──────────────────────────────────────────────────────────────

    private static FakeAgentClient WithCatalog()
    {
        var client = Data.Client();
        var otherAssembly = Guid.NewGuid();
        var otherType = Guid.NewGuid();
        var otherStep = Guid.NewGuid();
        client.ByEntity["pluginassembly"] =
        [
            Row("pluginassembly", AssemblyId, ("name", "Contoso.Plugins"), ("customizationlevel", 1)),
            Row("pluginassembly", otherAssembly, ("name", "Fabrikam.Flows"), ("customizationlevel", 1)),
        ];
        client.ByEntity["plugintype"] =
        [
            Row("plugintype", TypeId, ("typename", "Contoso.A"), ("pluginassemblyid", new EntityReference("pluginassembly", AssemblyId))),
            Row("plugintype", otherType, ("typename", "Fabrikam.B"), ("pluginassemblyid", new EntityReference("pluginassembly", otherAssembly))),
        ];
        client.ByEntity["sdkmessageprocessingstep"] =
        [
            Row("sdkmessageprocessingstep", StepId, ("name", "A step"), ("plugintypeid", new EntityReference("plugintype", TypeId)),
                ("sdkmessage.name", new AliasedValue("sdkmessage", "name", "Create")),
                ("sdkmessagefilter.primaryobjecttypecode", new AliasedValue("sdkmessagefilter", "primaryobjecttypecode", "account"))),
            Row("sdkmessageprocessingstep", otherStep, ("name", "B step"), ("plugintypeid", new EntityReference("plugintype", otherType)),
                ("sdkmessage.name", new AliasedValue("sdkmessage", "name", "Update")),
                ("sdkmessagefilter.primaryobjecttypecode", new AliasedValue("sdkmessagefilter", "primaryobjecttypecode", "contact"))),
        ];
        client.ByEntity["sdkmessageprocessingstepimage"] =
        [
            Row("sdkmessageprocessingstepimage", Guid.NewGuid(), ("name", "pre"), ("sdkmessageprocessingstepid", new EntityReference("sdkmessageprocessingstep", StepId))),
            Row("sdkmessageprocessingstepimage", Guid.NewGuid(), ("name", "other"), ("sdkmessageprocessingstepid", new EntityReference("sdkmessageprocessingstep", otherStep))),
        ];
        return client;
    }

    [Fact]
    public async Task Catalog_without_filters_returns_everything()
    {
        var service = new AgentPluginsService(WithCatalog(), new FakeInspector(), true);

        var result = await service.CatalogAsync(null, null, null, CancellationToken.None);

        Assert.Equal((2, 2, 2, 2), (result.Value!.Assemblies.Count, result.Value.Types.Count, result.Value.Steps.Count, result.Value.Images.Count));
    }

    [Fact]
    public async Task Catalog_narrows_by_assembly_name_table_and_message()
    {
        var service = new AgentPluginsService(WithCatalog(), new FakeInspector(), true);

        var byAssembly = await service.CatalogAsync("contoso", null, null, CancellationToken.None);
        Assert.Equal(["Contoso.Plugins"], byAssembly.Value!.Assemblies.Select(a => a.Name));
        Assert.Equal(["A step"], byAssembly.Value.Steps.Select(s => s.Name));
        Assert.Equal(["pre"], byAssembly.Value.Images.Select(i => i.Name));

        var byTable = await service.CatalogAsync(null, "CONTACT", null, CancellationToken.None);
        Assert.Equal(["B step"], byTable.Value!.Steps.Select(s => s.Name));
        Assert.Equal(["Fabrikam.Flows"], byTable.Value.Assemblies.Select(a => a.Name));

        var byMessage = await service.CatalogAsync(null, null, "create", CancellationToken.None);
        Assert.Equal(["A step"], byMessage.Value!.Steps.Select(s => s.Name));

        var none = await service.CatalogAsync(null, "account", "Update", CancellationToken.None);
        Assert.Empty(none.Value!.Steps);
        Assert.Empty(none.Value.Assemblies);
    }

    [Fact]
    public async Task The_catalog_never_carries_secure_configuration_text()
    {
        var client = WithCatalog();
        client.ByEntity["sdkmessageprocessingstep"][0]["sdkmessageprocessingstepsecureconfigid"] = new EntityReference("sdkmessageprocessingstepsecureconfig", Guid.NewGuid());
        var service = new AgentPluginsService(client, new FakeInspector(), true);

        var result = await service.CatalogAsync(null, null, null, CancellationToken.None);

        Assert.True(result.Value!.Steps.Single(s => s.Id == StepId).HasSecureConfiguration);
    }
}
