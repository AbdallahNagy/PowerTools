using PowerTools.API.Tools.PluginRegistration;

namespace PowerTools.API.PluginRegistration.Tests.Support;

internal sealed class FakePluginRegistrationGateway(params PluginRegistrationRows[] pages)
    : IPluginRegistrationGateway
{
    public int CallCount { get; private set; }

    public Task<PluginRegistrationRows> RetrieveCatalogRowsAsync(
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        CallCount++;
        return Task.FromResult(new PluginRegistrationRows(
            pages.SelectMany(page => page.Assemblies).ToArray(),
            pages.SelectMany(page => page.Types).ToArray(),
            pages.SelectMany(page => page.Steps).ToArray(),
            pages.SelectMany(page => page.Images).ToArray()));
    }
}
