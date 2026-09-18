using Microsoft.Xrm.Sdk;
using PowerTools.API.PluginRegistration.Tests.Support;
using PowerTools.API.Tools.PluginRegistration.Dtos;
using PowerTools.API.Tools.PluginRegistration.Services;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Images;

public sealed class ImageServiceTests
{
    private readonly Guid _stepId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
    private readonly Guid _messageId = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
    private readonly Guid _imageId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");

    [Fact]
    public async Task Create_sets_message_property_from_the_parent_message()
    {
        var gateway = SeedParent("Update", 40);
        var service = new ImageService(gateway);

        await service.CreateAsync(Draft(), CancellationToken.None);

        var created = Assert.Single(gateway.Created);
        Assert.Equal("Target", created.GetAttributeValue<string>("messagepropertyname"));
        Assert.Equal("name,revenue", created.GetAttributeValue<string>("attributes"));
        Assert.Equal(0, created.GetAttributeValue<OptionSetValue>("imagetype").Value);
    }

    [Fact]
    public async Task Create_uses_id_property_for_create_messages()
    {
        var gateway = SeedParent("Create", 40);
        var service = new ImageService(gateway);

        await service.CreateAsync(Draft() with { ImageType = 1 }, CancellationToken.None);

        Assert.Equal(
            "Id",
            Assert.Single(gateway.Created).GetAttributeValue<string>("messagepropertyname"));
    }

    [Fact]
    public async Task Update_writes_only_the_image_record()
    {
        var gateway = SeedParent("Update", 40);
        gateway.Seed(new Entity("sdkmessageprocessingstepimage", _imageId)
        {
            ["ismanaged"] = false,
            ["customizationlevel"] = 1,
            ["sdkmessageprocessingstepid"] = new EntityReference("sdkmessageprocessingstep", _stepId),
        });
        var service = new ImageService(gateway);

        await service.UpdateAsync(_imageId, Draft() with { Name = "Updated" }, CancellationToken.None);

        var updated = Assert.Single(gateway.Updated);
        Assert.Equal("sdkmessageprocessingstepimage", updated.LogicalName);
        Assert.Equal(_imageId, updated.Id);
        Assert.Equal("Updated", updated.GetAttributeValue<string>("name"));
    }

    private FakePluginRegistrationGateway SeedParent(string messageName, int stage)
    {
        var gateway = new FakePluginRegistrationGateway();
        gateway.Seed(new Entity("sdkmessage", _messageId) { ["name"] = messageName });
        gateway.Seed(new Entity("sdkmessageprocessingstep", _stepId)
        {
            ["stage"] = new OptionSetValue(stage),
            ["ismanaged"] = false,
            ["customizationlevel"] = 1,
            ["sdkmessageid"] = new EntityReference("sdkmessage", _messageId),
        });
        return gateway;
    }

    private ImageDraftDto Draft() => new(
        _stepId,
        "PreImage",
        "Target",
        0,
        ["name", "revenue"]);
}
