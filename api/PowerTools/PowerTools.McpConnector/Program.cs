using PowerTools.Mcp;

// MCP clients start this with no arguments. Options, for development and tests:
//   --discovery <path>   The discovery file to read instead of %APPDATA%\Power Tools\mcp-endpoint.json.
//   --poll-ms <int>      How often to look for the app while it is not running.
return await McpConnector.RunAsync(args, Console.OpenStandardInput(), Console.OpenStandardOutput(), CancellationToken.None);
