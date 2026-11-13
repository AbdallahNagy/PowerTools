import { join, resolve } from "node:path";

export interface ConnectorLaunch {
  command: string;
  args: string[];
}

export interface ConnectorCommandOptions {
  packaged: boolean;
  platform: NodeJS.Platform;
  /** `process.resourcesPath` of a packaged app. */
  resourcesPath: string;
  /** `app.getAppPath()`; the desktop folder in development. */
  appPath: string;
  discoveryPath: string;
}

/** How an MCP client starts the stdio connector. Follows the same paths sidecar.ts spawns. */
export function connectorLaunch(options: ConnectorCommandOptions): ConnectorLaunch {
  const exeName = options.platform === "win32" ? "PowerTools.API.exe" : "PowerTools.API";
  if (options.packaged) {
    return { command: join(options.resourcesPath, "api", exeName), args: ["--mcp-connector"] };
  }
  // Development has no published executable; use the one `dotnet build` leaves next to the project.
  const exe = resolve(options.appPath, "..", "api", "PowerTools", "PowerTools.API", "bin", "Debug", "net9.0", exeName);
  return { command: exe, args: ["--mcp-connector", "--discovery", options.discoveryPath] };
}

const quote = (value: string) => (/\s/.test(value) ? `"${value}"` : value);

/** The launch as one line a person can paste after `claude mcp add powertools --`. */
export function connectorCommandLine(launch: ConnectorLaunch): string {
  return [launch.command, ...launch.args].map(quote).join(" ");
}
