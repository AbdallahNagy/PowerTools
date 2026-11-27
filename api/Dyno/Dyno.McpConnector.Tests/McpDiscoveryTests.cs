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

    [Fact]
    public void OfflineMessage_IsThePlainMessageWhenTheClientReadsTheDefaultFileAndNoStaleProcessIsNamed()
    {
        var path = Path.Combine(Path.GetTempPath(), $"dyno-missing-{Guid.NewGuid():N}.json");

        Assert.Equal(Dyno.Mcp.McpConnector.OfflineMessage, McpDiscovery.OfflineMessage(path, path, _ => true));
    }

    [Fact]
    public void OfflineMessage_NamesAFileLeftByADynoThatHasExitedAndTheInstalledAppsFile()
    {
        var path = Path.Combine(Path.GetTempPath(), $"dyno-stale-{Guid.NewGuid():N}.json");
        File.WriteAllText(path, """{ "port": 51234, "token": "t", "pid": 27928 }""");
        try
        {
            var message = McpDiscovery.OfflineMessage(path, Path.Combine(AppData, "Dyno", "mcp-endpoint.json"), pid => pid != 27928);

            Assert.StartsWith(Dyno.Mcp.McpConnector.OfflineMessage, message);
            Assert.Contains("no longer running (process 27928)", message);
            Assert.Contains(Path.Combine(AppData, "Dyno", "mcp-endpoint.json"), message);
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public void OfflineMessage_SaysNothingAboutAProcessThatIsStillRunning()
    {
        var path = Path.Combine(Path.GetTempPath(), $"dyno-live-{Guid.NewGuid():N}.json");
        File.WriteAllText(path, """{ "port": 51234, "token": "t", "pid": 4242 }""");
        try
        {
            Assert.Equal(Dyno.Mcp.McpConnector.OfflineMessage, McpDiscovery.OfflineMessage(path, path, _ => true));
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public void IsRunning_KnowsThisProcessAndNotAnUnusedId()
    {
        Assert.True(McpDiscovery.IsRunning(Environment.ProcessId));
        Assert.False(McpDiscovery.IsRunning(int.MaxValue));
    }
}
