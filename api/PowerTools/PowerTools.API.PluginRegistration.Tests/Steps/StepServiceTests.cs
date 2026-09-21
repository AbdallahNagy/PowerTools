using Microsoft.Xrm.Sdk;
using PowerTools.API.PluginRegistration.Tests.Support;
using PowerTools.API.Tools.PluginRegistration;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Services;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Steps;

public sealed class StepServiceTests
{
    private readonly Guid _typeId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private readonly Guid _messageId = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private readonly Guid _filterId = Guid.Parse("ffffffff-ffff-ffff-ffff-ffffffffffff");
    private readonly Guid _stepId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private readonly Guid _secureId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task Create_omits_filter_and_attributes_when_empty()
    {
        var gateway = CreateGateway();
        var service = new StepService(gateway);

        await service.CreateAsync(Draft(), CancellationToken.None);

        var created = Assert.Single(gateway.Created, e => e.LogicalName == "sdkmessageprocessingstep");
        Assert.False(created.Contains("sdkmessagefilterid"));
        Assert.False(created.Contains("filteringattributes"));
        Assert.False(created.Contains("impersonatinguserid"));
    }

    [Fact]
    public async Task Update_clears_filter_and_attributes()
    {
        var gateway = CreateGateway();
        SeedWritableStep(gateway);
        var service = new StepService(gateway);

        await service.UpdateAsync(_stepId, Draft(), CancellationToken.None);

        var updated = Assert.Single(gateway.Updated, e => e.LogicalName == "sdkmessageprocessingstep");
        Assert.Null(updated["sdkmessagefilterid"]);
        Assert.Equal("", updated["filteringattributes"]);
    }

    [Fact]
    public async Task Create_sets_filter_and_attributes_when_provided()
    {
        var gateway = CreateGateway();
        var service = new StepService(gateway);

        await service.CreateAsync(
            Draft() with { FilterId = _filterId, FilteringAttributes = ["name"] },
            CancellationToken.None);

        var created = Assert.Single(gateway.Created, e => e.LogicalName == "sdkmessageprocessingstep");
        Assert.Equal(_filterId, created.GetAttributeValue<EntityReference>("sdkmessagefilterid").Id);
        Assert.Equal("name", created.GetAttributeValue<string>("filteringattributes"));
    }

    [Fact]
    public async Task Create_defaults_blank_name_to_message_of_entity()
    {
        var gateway = CreateGateway();
        gateway.Seed(new Entity("sdkmessagefilter", _filterId)
        {
            ["primaryobjecttypecode"] = "account",
        });
        var service = new StepService(gateway);

        await service.CreateAsync(
            Draft() with { Name = "", FilterId = _filterId },
            CancellationToken.None);

        var created = Assert.Single(gateway.Created, e => e.LogicalName == "sdkmessageprocessingstep");
        Assert.Equal("Update of account", created.GetAttributeValue<string>("name"));
    }

    [Fact]
    public async Task Create_defaults_blank_name_to_message_when_filter_is_missing()
    {
        var gateway = CreateGateway();
        var service = new StepService(gateway);

        await service.CreateAsync(Draft() with { Name = "  " }, CancellationToken.None);

        var created = Assert.Single(gateway.Created, e => e.LogicalName == "sdkmessageprocessingstep");
        Assert.Equal("Update", created.GetAttributeValue<string>("name"));
    }

    [Fact]
    public async Task Create_cleans_up_orphan_secure_config_when_step_create_fails()
    {
        var gateway = CreateGateway();
        gateway.CreateError = entity =>
            entity.LogicalName == "sdkmessageprocessingstep"
                ? new InvalidOperationException("step failed")
                : null;
        var service = new StepService(gateway);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CreateAsync(
                Draft() with
                {
                    SecureConfigurationAction = "replace",
                    SecureConfiguration = "secret",
                },
                CancellationToken.None));

        Assert.Contains(
            gateway.Created,
            e => e.LogicalName == "sdkmessageprocessingstepsecureconfig");
        Assert.Contains(
            gateway.Deleted,
            item => item.EntityName == "sdkmessageprocessingstepsecureconfig");
    }

    [Fact]
    public async Task Update_rejects_managed_steps()
    {
        var gateway = CreateGateway();
        gateway.Seed(new Entity("sdkmessageprocessingstep", _stepId)
        {
            ["ismanaged"] = true,
            ["customizationlevel"] = 1,
        });
        var service = new StepService(gateway);

        var ex = await Assert.ThrowsAsync<RegistrationException>(
            () => service.UpdateAsync(_stepId, Draft(), CancellationToken.None));
        Assert.Equal("step_read_only", ex.Problem.Code);
        Assert.Equal(409, ex.StatusCode);
    }

    [Fact]
    public async Task Enable_and_disable_set_state_and_status()
    {
        var gateway = CreateGateway();
        SeedWritableStep(gateway);
        var service = new StepService(gateway);

        await service.SetEnabledAsync(_stepId, false, CancellationToken.None);
        await service.SetEnabledAsync(_stepId, true, CancellationToken.None);

        Assert.Equal(1, gateway.Updated[0].GetAttributeValue<OptionSetValue>("statecode").Value);
        Assert.Equal(2, gateway.Updated[0].GetAttributeValue<OptionSetValue>("statuscode").Value);
        Assert.Equal(0, gateway.Updated[1].GetAttributeValue<OptionSetValue>("statecode").Value);
        Assert.Equal(1, gateway.Updated[1].GetAttributeValue<OptionSetValue>("statuscode").Value);
    }

    [Fact]
    public async Task Update_replace_creates_secure_config_when_missing()
    {
        var gateway = CreateGateway();
        SeedWritableStep(gateway);
        var service = new StepService(gateway);

        await service.UpdateAsync(
            _stepId,
            Draft() with
            {
                SecureConfigurationAction = "replace",
                SecureConfiguration = "secret",
            },
            CancellationToken.None);

        Assert.Contains(
            gateway.Created,
            e => e.LogicalName == "sdkmessageprocessingstepsecureconfig"
                && e.GetAttributeValue<string>("secureconfig") == "secret");
        Assert.Contains(
            gateway.Updated,
            e => e.LogicalName == "sdkmessageprocessingstep"
                && e.Contains("sdkmessageprocessingstepsecureconfigid"));
    }

    [Fact]
    public async Task Update_clear_unlinks_then_deletes_secure_config()
    {
        var gateway = CreateGateway();
        SeedWritableStep(gateway, withSecure: true);
        var service = new StepService(gateway);

        await service.UpdateAsync(
            _stepId,
            Draft() with { SecureConfigurationAction = "clear" },
            CancellationToken.None);

        var stepUpdate = Assert.Single(
            gateway.Updated,
            e => e.LogicalName == "sdkmessageprocessingstep");
        Assert.Null(stepUpdate["sdkmessageprocessingstepsecureconfigid"]);
        Assert.Contains(gateway.Deleted, item => item is
            ("sdkmessageprocessingstepsecureconfig", var id) && id == _secureId);
    }

    private FakePluginRegistrationGateway CreateGateway()
    {
        var gateway = new FakePluginRegistrationGateway();
        gateway.Seed(new Entity("sdkmessage", _messageId) { ["name"] = "Update" });
        return gateway;
    }

    private void SeedWritableStep(FakePluginRegistrationGateway gateway, bool withSecure = false)
    {
        var step = new Entity("sdkmessageprocessingstep", _stepId)
        {
            ["ismanaged"] = false,
            ["customizationlevel"] = 1,
        };
        if (withSecure)
        {
            step["sdkmessageprocessingstepsecureconfigid"] =
                new EntityReference("sdkmessageprocessingstepsecureconfig", _secureId);
            gateway.Seed(new Entity("sdkmessageprocessingstepsecureconfig", _secureId));
        }

        gateway.Seed(step);
    }

    private StepDraftDto Draft() => new(
        "AccountPlugin: Update of account",
        _typeId,
        _messageId,
        null,
        40,
        0,
        1,
        0,
        false,
        [],
        null,
        null,
        null,
        "keep",
        null);
}
