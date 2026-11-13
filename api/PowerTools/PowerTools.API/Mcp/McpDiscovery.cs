using System.Text.Json;

namespace PowerTools.API.Mcp;

/// <summary>Reads the file the desktop app writes while its MCP server is on: { port, token, pid }.</summary>
public static class McpDiscovery
{
    public static string DefaultPath() =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Power Tools", "mcp-endpoint.json");

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
