using System.Text.Json;

namespace Dyno.Mcp;

/// <summary>Reads the file the desktop app writes while its MCP server is on: { port, token, pid }.</summary>
public static class McpDiscovery
{
    public const string AppFolder = "Dyno";

    /// <summary>The folder installs from before the rename to Dyno keep using.</summary>
    public const string LegacyAppFolder = "Power Tools";

    public static string DefaultPath() =>
        DefaultPath(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), Directory.Exists);

    /// <summary>
    /// The discovery file in the app's data folder: Dyno, unless only the Power Tools folder from before the rename
    /// exists. The same rule as the desktop app's src/electron/userDataFolder.ts.
    /// </summary>
    public static string DefaultPath(string appData, Func<string, bool> folderExists)
    {
        var folder = !folderExists(Path.Combine(appData, AppFolder)) && folderExists(Path.Combine(appData, LegacyAppFolder))
            ? LegacyAppFolder
            : AppFolder;
        return Path.Combine(appData, folder, "mcp-endpoint.json");
    }

    /// <summary>Null when the file is missing, unreadable or incomplete.</summary>
    public static (int Port, string Token)? TryRead(string path)
    {
        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var doc = JsonDocument.Parse(stream);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("port", out var port) || !port.TryGetInt32(out var portValue)
                || !root.TryGetProperty("token", out var token) || token.ValueKind != JsonValueKind.String)
            {
                return null;
            }

            var tokenValue = token.GetString();
            return portValue > 0 && !string.IsNullOrEmpty(tokenValue) ? (portValue, tokenValue) : null;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return null;
        }
    }
}
