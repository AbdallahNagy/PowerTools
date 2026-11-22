using Microsoft.PowerPlatform.Dataverse.Client;
using Dyno.Api.Services;

namespace Dyno.Api.Tests.Tools.PluginRegistration.Support;

public sealed class FakeCurrentConnection(DataverseConnectionContext context) : ICurrentConnection
{
    public DataverseConnectionContext Context { get; } = context;
    public string EnvironmentUrl => Context.EnvironmentUrl;

    public IOrganizationServiceAsync2 CreateClient() =>
        throw new NotSupportedException(
            "Tests use IPluginRegistrationGateway instead of a live Dataverse client.");
}
