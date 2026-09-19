using Microsoft.PowerPlatform.Dataverse.Client;
using PowerTools.API.Services;

namespace PowerTools.API.PluginRegistration.Tests.Support;

public sealed class FakeCurrentConnection(DataverseConnectionContext context) : ICurrentConnection
{
    public DataverseConnectionContext Context { get; } = context;
    public string EnvironmentUrl => Context.EnvironmentUrl;

    public IOrganizationServiceAsync2 CreateClient() =>
        throw new NotSupportedException(
            "Tests use IPluginRegistrationGateway instead of a live Dataverse client.");
}
