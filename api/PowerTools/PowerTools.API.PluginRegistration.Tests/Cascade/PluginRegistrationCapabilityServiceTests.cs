using PowerTools.API.Tools.PluginRegistration;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Cascade;

public sealed class PluginRegistrationCapabilityServiceTests
{
    [Fact]
    public void Cascade_execute_is_disabled_until_release_approval_and_environment_support_are_both_true()
    {
        var disabled = new PluginRegistrationCapabilityService().GetCapabilities(environmentSupportsTransaction: true);
        var unsupported = new PluginRegistrationCapabilityService(true).GetCapabilities(environmentSupportsTransaction: false);

        Assert.False(disabled.TransactionalCascadeUnregister.Supported);
        Assert.False(unsupported.TransactionalCascadeUnregister.Supported);
        Assert.Contains("not release-approved", disabled.TransactionalCascadeUnregister.Reason);
    }
}
