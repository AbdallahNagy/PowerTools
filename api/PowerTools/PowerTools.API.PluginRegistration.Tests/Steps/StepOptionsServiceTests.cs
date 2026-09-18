using Microsoft.Xrm.Sdk;
using PowerTools.API.PluginRegistration.Tests.Support;
using PowerTools.API.Tools.PluginRegistration.Services;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Steps;

public sealed class StepOptionsServiceTests
{
    [Fact]
    public async Task GetAsync_reads_integer_filter_availability()
    {
        var messageId = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee");
        var filterId = Guid.Parse("ffffffff-ffff-ffff-ffff-ffffffffffff");
        var userId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        var gateway = new FakePluginRegistrationGateway();
        gateway.Seed(new Entity("sdkmessage", messageId) { ["name"] = "Update" });
        gateway.Seed(new Entity("sdkmessagefilter", filterId)
        {
            ["sdkmessageid"] = new EntityReference("sdkmessage", messageId),
            ["primaryobjecttypecode"] = "account",
            ["secondaryobjecttypecode"] = "none",
            // Dataverse returns sdkmessagefilter.availability as a plain integer,
            // not an OptionSetValue.
            ["availability"] = 2,
        });
        gateway.Seed(new Entity("systemuser", userId) { ["fullname"] = "Ada Lovelace" });

        var options = await new StepOptionsService(gateway).GetAsync(CancellationToken.None);

        var message = Assert.Single(options.Messages);
        Assert.Equal("Update", message.Name);

        var filter = Assert.Single(options.Filters);
        Assert.Equal(messageId, filter.MessageId);
        Assert.Equal("account", filter.PrimaryEntity);
        Assert.Equal(2, filter.Availability);

        var user = Assert.Single(options.Users);
        Assert.Equal("Ada Lovelace", user.FullName);
    }

    [Fact]
    public async Task GetAsync_tolerates_option_set_filter_availability()
    {
        var gateway = new FakePluginRegistrationGateway();
        gateway.Seed(new Entity("sdkmessagefilter")
        {
            ["sdkmessageid"] = new EntityReference("sdkmessage", Guid.NewGuid()),
            ["availability"] = new OptionSetValue(1),
        });

        var options = await new StepOptionsService(gateway).GetAsync(CancellationToken.None);

        Assert.Equal(1, Assert.Single(options.Filters).Availability);
    }
}
