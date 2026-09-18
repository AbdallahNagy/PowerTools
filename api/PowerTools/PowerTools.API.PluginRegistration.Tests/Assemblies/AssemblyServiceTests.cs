using Microsoft.Xrm.Sdk;
using PowerTools.API.PluginRegistration.Tests.Support;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Inspection;
using PowerTools.API.Tools.PluginRegistration.Services;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Assemblies;

public sealed class AssemblyServiceTests
{
    private const string ExpectedPublicKeyToken = "d2997b4d969e30c1";
    private readonly Guid _assemblyId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Fact]
    public async Task Analyze_returns_the_inspector_identity_for_the_mixed_fixture()
    {
        var service = CreateService(new FakePluginRegistrationGateway());
        await using var stream = File.OpenRead(FixturePath("MixedRegistrationAssembly.dll"));

        var result = await service.AnalyzeAsync(
            stream,
            "MixedRegistrationAssembly.dll",
            stream.Length,
            CancellationToken.None);

        Assert.Equal("MixedRegistrationAssembly", result.Identity.Name);
        Assert.Equal("1.2.3.4", result.Identity.Version);
        Assert.Equal(ExpectedPublicKeyToken, result.Identity.PublicKeyToken);
        Assert.Empty(result.Diagnostics);
    }

    [Fact]
    public async Task Register_creates_assembly_content_and_missing_types()
    {
        var gateway = new FakePluginRegistrationGateway();
        var service = CreateService(gateway);
        var bytes = await File.ReadAllBytesAsync(FixturePath("MixedRegistrationAssembly.dll"));
        await using var stream = new MemoryStream(bytes);

        var result = await service.RegisterAsync(
            stream,
            "MixedRegistrationAssembly.dll",
            bytes.LongLength,
            new AssemblyRegisterRequest(2, 0),
            Online(),
            CancellationToken.None);

        var assembly = Assert.Single(gateway.Created, entity => entity.LogicalName == "pluginassembly");
        Assert.Equal(result.Id, assembly.Id);
        Assert.Equal("MixedRegistrationAssembly", assembly.GetAttributeValue<string>("name"));
        Assert.Equal("1.2.3.4", assembly.GetAttributeValue<string>("version"));
        Assert.Equal("neutral", assembly.GetAttributeValue<string>("culture"));
        Assert.Equal(ExpectedPublicKeyToken, assembly.GetAttributeValue<string>("publickeytoken"));
        Assert.Equal(2, assembly.GetAttributeValue<OptionSetValue>("isolationmode").Value);
        Assert.Equal(0, assembly.GetAttributeValue<OptionSetValue>("sourcetype").Value);
        Assert.Equal(Convert.ToBase64String(bytes), assembly.GetAttributeValue<string>("content"));

        var types = gateway.Created.Where(entity => entity.LogicalName == "plugintype").ToList();
        Assert.Equal(4, types.Count);
        Assert.All(types, type => Assert.False(type.Contains("isworkflowactivity")));
        Assert.Contains(types, type =>
            type.GetAttributeValue<string>("typename") == "MixedRegistrationAssembly.AlphaPlugin"
            && type.GetAttributeValue<string>("name") == "MixedRegistrationAssembly.AlphaPlugin"
            && type.GetAttributeValue<string>("friendlyname") == "MixedRegistrationAssembly.AlphaPlugin");
        Assert.Contains(types, type =>
            type.GetAttributeValue<string>("typename") == "MixedRegistrationAssembly.FirstWorkflowActivity"
            && type.GetAttributeValue<string>("workflowactivitygroupname") ==
                "MixedRegistrationAssembly (1.2.3.4)");
    }

    [Fact]
    public async Task Register_rejects_online_none_isolation()
    {
        var service = CreateService(new FakePluginRegistrationGateway());
        await using var stream = File.OpenRead(FixturePath("MixedRegistrationAssembly.dll"));

        var error = await Assert.ThrowsAsync<RegistrationException>(() =>
            service.RegisterAsync(
                stream,
                "MixedRegistrationAssembly.dll",
                stream.Length,
                new AssemblyRegisterRequest(1, 0),
                Online(),
                CancellationToken.None));

        Assert.Equal(400, error.StatusCode);
        Assert.Contains(error.Problem.Problems, problem => problem.Field == "isolationMode");
    }

    [Fact]
    public async Task Register_rejects_error_diagnostics()
    {
        var gateway = new FakePluginRegistrationGateway();
        var service = CreateService(gateway);
        await using var stream = File.OpenRead(FixturePath("UnsupportedTargetFrameworkAssembly.dll"));

        var error = await Assert.ThrowsAsync<RegistrationException>(() =>
            service.RegisterAsync(
                stream,
                "UnsupportedTargetFrameworkAssembly.dll",
                stream.Length,
                new AssemblyRegisterRequest(2, 0),
                Online(),
                CancellationToken.None));

        Assert.Contains(
            error.Problem.Problems,
            problem => problem.Code == "target_framework_unsupported");
        Assert.Empty(gateway.Created);
    }

    [Fact]
    public async Task Update_writes_content_and_version_and_syncs_new_types()
    {
        var gateway = SeedWritableAssembly("1.2.0.0");
        gateway.Seed(Type("MixedRegistrationAssembly.AlphaPlugin"));
        var service = CreateService(gateway);
        var bytes = await File.ReadAllBytesAsync(FixturePath("MixedRegistrationAssembly.dll"));
        await using var stream = new MemoryStream(bytes);

        await service.UpdateAsync(
            _assemblyId,
            stream,
            "MixedRegistrationAssembly.dll",
            bytes.LongLength,
            CancellationToken.None);

        var updated = Assert.Single(gateway.Updated);
        Assert.Equal("pluginassembly", updated.LogicalName);
        Assert.Equal(Convert.ToBase64String(bytes), updated.GetAttributeValue<string>("content"));
        Assert.Equal("1.2.3.4", updated.GetAttributeValue<string>("version"));
        Assert.Equal(3, gateway.Created.Count(entity => entity.LogicalName == "plugintype"));
        Assert.DoesNotContain(
            gateway.Created,
            entity => entity.GetAttributeValue<string>("typename") == "MixedRegistrationAssembly.AlphaPlugin");
    }

    [Fact]
    public async Task Update_rejects_identity_mismatch()
    {
        var gateway = SeedWritableAssembly("1.2.0.0", name: "Other.Assembly");
        var service = CreateService(gateway);
        await using var stream = File.OpenRead(FixturePath("MixedRegistrationAssembly.dll"));

        var error = await Assert.ThrowsAsync<RegistrationException>(() =>
            service.UpdateAsync(
                _assemblyId,
                stream,
                "MixedRegistrationAssembly.dll",
                stream.Length,
                CancellationToken.None));

        Assert.Equal("assembly_identity_mismatch", error.Problem.Code);
        Assert.Empty(gateway.Updated);
    }

    [Fact]
    public async Task Update_rejects_major_or_minor_version_change()
    {
        var gateway = SeedWritableAssembly("1.1.0.0");
        var service = CreateService(gateway);
        await using var stream = File.OpenRead(FixturePath("MixedRegistrationAssembly.dll"));

        var error = await Assert.ThrowsAsync<RegistrationException>(() =>
            service.UpdateAsync(
                _assemblyId,
                stream,
                "MixedRegistrationAssembly.dll",
                stream.Length,
                CancellationToken.None));

        Assert.Equal("assembly_version_change", error.Problem.Code);
    }

    [Fact]
    public async Task Update_rejects_missing_registered_types()
    {
        var gateway = SeedWritableAssembly("1.2.0.0");
        gateway.Seed(Type("MixedRegistrationAssembly.AlphaPlugin"));
        gateway.Seed(Type("Contoso.Plugins.MissingType"));
        var service = CreateService(gateway);
        await using var stream = File.OpenRead(FixturePath("MixedRegistrationAssembly.dll"));

        var error = await Assert.ThrowsAsync<RegistrationException>(() =>
            service.UpdateAsync(
                _assemblyId,
                stream,
                "MixedRegistrationAssembly.dll",
                stream.Length,
                CancellationToken.None));

        Assert.Equal("assembly_missing_types", error.Problem.Code);
        Assert.Contains(
            error.Problem.Problems,
            problem => problem.Message == "Contoso.Plugins.MissingType");
    }

    [Fact]
    public async Task Update_rejects_managed_assemblies()
    {
        var gateway = SeedWritableAssembly("1.2.0.0");
        gateway.Records[("pluginassembly", _assemblyId)]["ismanaged"] = true;
        var service = CreateService(gateway);
        await using var stream = File.OpenRead(FixturePath("MixedRegistrationAssembly.dll"));

        var error = await Assert.ThrowsAsync<RegistrationException>(() =>
            service.UpdateAsync(
                _assemblyId,
                stream,
                "MixedRegistrationAssembly.dll",
                stream.Length,
                CancellationToken.None));

        Assert.Equal("assembly_read_only", error.Problem.Code);
    }

    private FakePluginRegistrationGateway SeedWritableAssembly(
        string version,
        string name = "MixedRegistrationAssembly")
    {
        var gateway = new FakePluginRegistrationGateway();
        gateway.Seed(new Entity("pluginassembly", _assemblyId)
        {
            ["name"] = name,
            ["publickeytoken"] = ExpectedPublicKeyToken,
            ["version"] = version,
            ["customizationlevel"] = 1,
            ["ismanaged"] = false,
        });
        return gateway;
    }

    private Entity Type(string typeName) => new("plugintype")
    {
        ["typename"] = typeName,
        ["pluginassemblyid"] = new EntityReference("pluginassembly", _assemblyId),
    };

    private static AssemblyService CreateService(FakePluginRegistrationGateway gateway) =>
        new(gateway, new PluginAssemblyInspector());

    private static CapabilitiesDto Online() => new(true, [2], [0]);

    private static string FixturePath(string fileName) =>
        Path.Combine(AppContext.BaseDirectory, "Fixtures", fileName);
}
