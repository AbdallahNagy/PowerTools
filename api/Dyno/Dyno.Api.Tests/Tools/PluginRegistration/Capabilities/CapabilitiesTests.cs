using Dyno.Api.Tests.Tools.PluginRegistration.Support;
using Dyno.Api.Services;
using Dyno.Api.Tools.PluginRegistration.Services;
using Dyno.Api.Tools.PluginRegistration.Validation;
using Xunit;

namespace Dyno.Api.Tests.Tools.PluginRegistration.Capabilities;

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
