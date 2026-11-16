import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Finds MCP client setups that still start the connector through the sidecar (`PowerTools.API.exe --mcp-connector`).
 * Such a client keeps a file in the install folder running, which blocks app updates. The Agents page warns about
 * them; the user's config files are only read, never changed.
 */

export type McpClientName = "Claude Code" | "Claude Desktop" | "VS Code";

export interface LegacySetup {
  client: McpClientName;
  configPath: string;
  /** The server's name in that config, usually "powertools". */
  server: string;
  /** Claude Code only: "user" for the global list, or the project folder it belongs to. */
  scope?: string;
}

export interface ClientConfigFile {
  client: McpClientName;
  path: string;
}

/** Config files the Agents page tells people to edit. Workspace configs live in folders the app cannot know. */
export function knownClientConfigs(env: { homeDir: string; appData: string }): ClientConfigFile[] {
  return [
    { client: "Claude Code", path: join(env.homeDir, ".claude.json") },
    { client: "Claude Desktop", path: join(env.appData, "Claude", "claude_desktop_config.json") },
    { client: "VS Code", path: join(env.appData, "Code", "User", "mcp.json") },
  ];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** True for a stdio server started through the sidecar executable. */
export function isLegacyServer(server: unknown): boolean {
  if (!isObject(server) || typeof server.command !== "string") return false;
  const executable = server.command.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (executable === "powertools.api.exe" || executable === "powertools.api") return true;
  return Array.isArray(server.args) && server.args.includes("--mcp-connector");
}

function legacyIn(servers: unknown): string[] {
  if (!isObject(servers)) return [];
  return Object.entries(servers)
    .filter(([, server]) => isLegacyServer(server))
    .map(([name]) => name);
}

/** The legacy servers in one config file's text. Text that is not a JSON object has none. */
export function findLegacySetups(file: ClientConfigFile, text: string): LegacySetup[] {
  let config: unknown;
  try {
    config = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isObject(config)) return [];

  const found = (server: string, scope?: string): LegacySetup => ({
    client: file.client,
    configPath: file.path,
    server,
    ...(scope ? { scope } : {}),
  });

  switch (file.client) {
    case "Claude Code": {
      const setups = legacyIn(config.mcpServers).map((name) => found(name, "user"));
      if (isObject(config.projects)) {
        for (const [folder, project] of Object.entries(config.projects)) {
          if (isObject(project)) setups.push(...legacyIn(project.mcpServers).map((name) => found(name, folder)));
        }
      }
      return setups;
    }
    case "Claude Desktop":
      return legacyIn(config.mcpServers).map((name) => found(name));
    case "VS Code":
      return legacyIn(config.servers).map((name) => found(name));
  }
}

export async function scanLegacySetups(
  files: ClientConfigFile[],
  readText: (path: string) => Promise<string> = (path) => readFile(path, "utf-8"),
): Promise<LegacySetup[]> {
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        return findLegacySetups(file, await readText(file.path));
      } catch {
        return []; // Missing or unreadable: that client is not set up here.
      }
    }),
  );
  return results.flat();
}
