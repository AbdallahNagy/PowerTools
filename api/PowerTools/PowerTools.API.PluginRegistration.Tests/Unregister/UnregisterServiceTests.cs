using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using PowerTools.API.PluginRegistration.Tests.Support;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Services;
using PowerTools.API.Tools.PluginRegistration.Validation;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Unregister;

public sealed class UnregisterServiceTests
{
    private readonly Guid _assemblyId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private readonly Guid _typeId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private readonly Guid _stepId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private readonly Guid _imageId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
    private readonly Guid _secureId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task Unregister_image_deletes_the_image()
    {
        var gateway = new FakePluginRegistrationGateway();
        gateway.Seed(Writable("sdkmessageprocessingstepimage", _imageId));
        var service = new UnregisterService(gateway);

        await service.UnregisterImageAsync(_imageId, CancellationToken.None);

        Assert.Equal(("sdkmessageprocessingstepimage", _imageId), Assert.Single(gateway.Deleted));
    }

    [Fact]
    public async Task Unregister_step_deletes_images_then_step_then_secure_config()
    {
        var gateway = new FakePluginRegistrationGateway();
        gateway.Seed(Writable("sdkmessageprocessingstep", _stepId, new()
        {
            ["sdkmessageprocessingstepsecureconfigid"] =
                new EntityReference("sdkmessageprocessingstepsecureconfig", _secureId),
        }));
        gateway.Seed(Writable("sdkmessageprocessingstepimage", _imageId, new()
        {
            ["sdkmessageprocessingstepid"] = new EntityReference("sdkmessageprocessingstep", _stepId),
        }));
        var service = new UnregisterService(gateway);

        await service.UnregisterStepAsync(_stepId, CancellationToken.None);

        var transaction = Assert.IsType<ExecuteTransactionRequest>(Assert.Single(gateway.Executed));
        Assert.False(transaction.ReturnResponses);
        Assert.Equal(
            [
                ("sdkmessageprocessingstepimage", _imageId),
                ("sdkmessageprocessingstep", _stepId),
                ("sdkmessageprocessingstepsecureconfig", _secureId),
            ],
            transaction.Requests.Cast<DeleteRequest>()
                .Select(request => (request.Target.LogicalName, request.Target.Id)));
    }

    [Fact]
    public async Task Unregister_type_rejects_when_steps_exist()
    {
        var gateway = new FakePluginRegistrationGateway();
        gateway.Seed(Writable("plugintype", _typeId));
        gateway.Seed(new Entity("sdkmessageprocessingstep", _stepId)
        {
            ["plugintypeid"] = new EntityReference("plugintype", _typeId),
        });
        var service = new UnregisterService(gateway);

        var error = await Assert.ThrowsAsync<RegistrationException>(() =>
            service.UnregisterTypeAsync(_typeId, CancellationToken.None));

        Assert.Equal("has_steps", error.Problem.Code);
        Assert.Empty(gateway.Deleted);
    }

    [Fact]
    public async Task Unregister_type_rejects_other_dependencies()
    {
        var gateway = new FakePluginRegistrationGateway();
        gateway.Seed(Writable("plugintype", _typeId));
        var dependentId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        gateway.ExecuteHandler = _ => new RetrieveDependenciesForDeleteResponse
        {
            ["EntityCollection"] = new EntityCollection(
            [
                new Entity("dependency")
                {
                    ["dependentcomponenttype"] = new OptionSetValue(29),
                    ["dependentcomponentobjectid"] = dependentId,
                },
            ]),
        };
        var service = new UnregisterService(gateway);

        var error = await Assert.ThrowsAsync<RegistrationException>(() =>
            service.UnregisterTypeAsync(_typeId, CancellationToken.None));

        Assert.Equal("has_dependencies", error.Problem.Code);
        Assert.Contains(error.Problem.Problems, problem => problem.Message.Contains(dependentId.ToString()));
        var request = Assert.IsType<RetrieveDependenciesForDeleteRequest>(Assert.Single(gateway.Executed));
        Assert.Equal(RegistrationOptionValues.ComponentTypePluginType, request.ComponentType);
        Assert.Equal(_typeId, request.ObjectId);
    }

    [Fact]
    public async Task Unregister_type_deletes_when_clear()
    {
        var gateway = new FakePluginRegistrationGateway();
        gateway.Seed(Writable("plugintype", _typeId));
        var service = new UnregisterService(gateway);

        await service.UnregisterTypeAsync(_typeId, CancellationToken.None);

        Assert.Equal(("plugintype", _typeId), Assert.Single(gateway.Deleted));
    }

    [Fact]
    public async Task Unregister_assembly_rejects_when_a_type_has_steps()
    {
        var gateway = new FakePluginRegistrationGateway();
        gateway.Seed(Writable("pluginassembly", _assemblyId));
        gateway.Seed(Writable("plugintype", _typeId, new()
        {
            ["pluginassemblyid"] = new EntityReference("pluginassembly", _assemblyId),
        }));
        gateway.Seed(new Entity("sdkmessageprocessingstep", _stepId)
        {
            ["plugintypeid"] = new EntityReference("plugintype", _typeId),
        });
        var service = new UnregisterService(gateway);

        var error = await Assert.ThrowsAsync<RegistrationException>(() =>
            service.UnregisterAssemblyAsync(_assemblyId, CancellationToken.None));

        Assert.Equal("has_steps", error.Problem.Code);
    }

    [Fact]
    public async Task Unregister_assembly_deletes_types_then_assembly()
    {
        var gateway = new FakePluginRegistrationGateway();
        gateway.Seed(Writable("pluginassembly", _assemblyId));
        gateway.Seed(Writable("plugintype", _typeId, new()
        {
            ["pluginassemblyid"] = new EntityReference("pluginassembly", _assemblyId),
        }));
        var service = new UnregisterService(gateway);

        await service.UnregisterAssemblyAsync(_assemblyId, CancellationToken.None);

        var transaction = Assert.IsType<ExecuteTransactionRequest>(Assert.Single(gateway.Executed, request => request is ExecuteTransactionRequest));
        Assert.False(transaction.ReturnResponses);
        Assert.Equal(
            [
                ("plugintype", _typeId),
                ("pluginassembly", _assemblyId),
            ],
            transaction.Requests.Cast<DeleteRequest>()
                .Select(request => (request.Target.LogicalName, request.Target.Id)));
    }

    [Fact]
    public async Task Unregister_rejects_managed_records()
    {
        var gateway = new FakePluginRegistrationGateway();
        gateway.Seed(new Entity("sdkmessageprocessingstepimage", _imageId)
        {
            ["ismanaged"] = true,
            ["customizationlevel"] = 1,
        });
        var service = new UnregisterService(gateway);

        var error = await Assert.ThrowsAsync<RegistrationException>(() =>
            service.UnregisterImageAsync(_imageId, CancellationToken.None));

        Assert.Equal("image_read_only", error.Problem.Code);
    }

    private static Entity Writable(
        string logicalName,
        Guid id,
        Dictionary<string, object>? extra = null)
    {
        var entity = new Entity(logicalName, id)
        {
            ["ismanaged"] = false,
            ["customizationlevel"] = 1,
        };
        if (extra is null)
            return entity;
        foreach (var pair in extra)
            entity[pair.Key] = pair.Value;
        return entity;
    }
}
