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

    /// <summary>
    /// Why the app cannot be reached, for the client: the plain offline message, plus what the discovery file says
    /// when that helps. A file left by a Dyno that has exited (often a development build) is named, and a client that
    /// reads another file than the installed app writes is told which file that is.
    /// </summary>
    public static string OfflineMessage(string path, string defaultPath, Func<int, bool> isRunning)
    {
        var message = Dyno.Mcp.McpConnector.OfflineMessage;
        if (TryReadPid(path) is { } pid && !isRunning(pid))
            message += $" The file this connector reads ({path}) was left by a Dyno that is no longer running (process {pid}).";
        if (!string.Equals(Path.GetFullPath(path), Path.GetFullPath(defaultPath), StringComparison.OrdinalIgnoreCase))
            message += $" This connector reads {path}, but the installed Dyno writes {defaultPath}; if you use the installed app, set the client up again from Dyno's Settings > Agents (MCP).";
        return message;
    }

    /// <summary>Whether a process with this id is running.</summary>
    public static bool IsRunning(int pid)
    {
        try
        {
            using var process = System.Diagnostics.Process.GetProcessById(pid);
            return !process.HasExited;
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            return false;
        }
    }

    /// <summary>The pid the app wrote, or null when the file or the value is missing.</summary>
    public static int? TryReadPid(string path)
    {
        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var doc = JsonDocument.Parse(stream);
            return doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("pid", out var pid) && pid.TryGetInt32(out var value) && value > 0
                ? value
                : null;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            return null;
        }
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
