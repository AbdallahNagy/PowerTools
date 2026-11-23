using Dyno.Mcp;
using Xunit;

namespace Dyno.McpConnector.Tests;

public sealed class McpDiscoveryTests
{
    private const string AppData = @"C:\Users\me\AppData\Roaming";

    private static Func<string, bool> Existing(params string[] folders) =>
        path => folders.Any(folder => path == Path.Combine(AppData, folder));

    [Fact]
    public void DefaultPath_UsesTheDynoFolderForANewInstall()
    {
        Assert.Equal(Path.Combine(AppData, "Dyno", "mcp-endpoint.json"), McpDiscovery.DefaultPath(AppData, Existing()));
    }

    [Fact]
    public void DefaultPath_KeepsThePowerToolsFolderOfAnInstallFromBeforeTheRename()
    {
        Assert.Equal(
            Path.Combine(AppData, "Power Tools", "mcp-endpoint.json"),
            McpDiscovery.DefaultPath(AppData, Existing("Power Tools")));
    }

    [Fact]
    public void DefaultPath_PrefersTheDynoFolderOnceItExists()
    {
        Assert.Equal(
            Path.Combine(AppData, "Dyno", "mcp-endpoint.json"),
            McpDiscovery.DefaultPath(AppData, Existing("Dyno", "Power Tools")));
    }
}
