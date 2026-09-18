using PowerTools.API.PluginRegistration.Tests.Support;
using PowerTools.API.Services;
using PowerTools.API.Tools.PluginRegistration.Services;
using PowerTools.API.Tools.PluginRegistration.Validation;
using Xunit;

namespace PowerTools.API.PluginRegistration.Tests.Capabilities;

public sealed class CapabilitiesTests
{
    [Fact]
    public void Online_connection_allows_sandbox_and_database_only()
    {
        var service = new CapabilitiesService(
            new FakeCurrentConnection(
                new OnlineConnectionContext("https://org.crm.dynamics.com", "token")));

        var result = service.Get();

        Assert.True(result.IsOnline);
        Assert.Equal(
            [RegistrationOptionValues.IsolationSandbox],
            result.IsolationModes);
        Assert.Equal(
            [RegistrationOptionValues.SourceDatabase],
            result.SourceTypes);
    }

    [Fact]
    public void On_prem_connection_allows_none_sandbox_database_and_disk()
    {
        var service = new CapabilitiesService(
            new FakeCurrentConnection(
                new OnPremisesConnectionContext(
                    "https://crm.contoso.local",
                    "ad",
                    "user",
                    "pass",
                    "DOMAIN")));

        var result = service.Get();

        Assert.False(result.IsOnline);
        Assert.Equal(
            [
                RegistrationOptionValues.IsolationNone,
                RegistrationOptionValues.IsolationSandbox,
            ],
            result.IsolationModes);
        Assert.Equal(
            [
                RegistrationOptionValues.SourceDatabase,
                RegistrationOptionValues.SourceDisk,
            ],
            result.SourceTypes);
    }
}
