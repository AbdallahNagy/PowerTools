import { join, resolve } from "node:path";

export interface ConnectorLaunch {
  command: string;
  args: string[];
}

export const CONNECTOR_EXE = "Dyno.McpConnector.exe";

export interface ConnectorCommandOptions {
  packaged: boolean;
  platform: NodeJS.Platform;
  /** `process.resourcesPath` of a packaged app. */
  resourcesPath: string;
  /** `app.getAppPath()`; the desktop folder in development. */
  appPath: string;
  discoveryPath: string;
  /** The per-user folder the connector is copied to; see connectorInstallFolder. */
  connectorDir: string;
}

/**
 * How an MCP client starts the stdio connector. On Windows it is the copy in the per-user folder, never a file in
 * the install folder: a client keeps the connector running, and a running file in the install folder blocks updates.
 */
export function connectorLaunch(options: ConnectorCommandOptions): ConnectorLaunch {
  if (options.platform === "win32") {
    const command = join(options.connectorDir, CONNECTOR_EXE);
    // A packaged connector finds the discovery file on its own; a dev run's userData folder is a different one.
    return { command, args: options.packaged ? [] : ["--discovery", options.discoveryPath] };
  }

  // Elsewhere a running file does not block replacing it, so the sidecar's deprecated connector mode is still used.
  const exeName = "Dyno.Api";
  if (options.packaged) {
    return { command: join(options.resourcesPath, "api", exeName), args: ["--mcp-connector"] };
  }
  const exe = resolve(options.appPath, "..", "api", "Dyno", "Dyno.Api", "bin", "Debug", "net9.0", exeName);
  return { command: exe, args: ["--mcp-connector", "--discovery", options.discoveryPath] };
}

/** `%LOCALAPPDATA%\<app folder>\mcp`. The installer and its updates never touch it. */
export function connectorInstallFolder(localAppData: string, appFolderName: string): string {
  return join(localAppData, appFolderName, "mcp");
}

/** Where the connector to copy comes from: the bundled single file, or the dev build output. */
export function bundledConnectorFolder(options: Pick<ConnectorCommandOptions, "packaged" | "resourcesPath" | "appPath">): string {
  if (options.packaged) return join(options.resourcesPath, "mcp-connector");
  return resolve(options.appPath, "..", "api", "Dyno", "Dyno.McpConnector", "bin", "Debug", "net9.0");
}

const quote = (value: string) => (/\s/.test(value) ? `"${value}"` : value);

/** The launch as one line a person can paste after `claude mcp add --scope user dyno --`. */
export function connectorCommandLine(launch: ConnectorLaunch): string {
  return [launch.command, ...launch.args].map(quote).join(" ");
}
