import { describe, expect, it } from "vitest";
import {
  findLegacySetups,
  isLegacyServer,
  knownClientConfigs,
  scanLegacySetups,
} from "../../../src/electron/mcp/legacySetups";

const legacy = {
  command: "C:\\Users\\me\\AppData\\Local\\Programs\\power-tools\\resources\\api\\PowerTools.API.exe",
  args: ["--mcp-connector"],
};
const current = { command: "C:\\Users\\me\\AppData\\Local\\Power Tools\\mcp\\Dyno.McpConnector.exe", args: [] };
const claudeCode = { client: "Claude Code" as const, path: "C:\\Users\\me\\.claude.json" };
const claudeDesktop = { client: "Claude Desktop" as const, path: "C:\\Users\\me\\AppData\\Roaming\\Claude\\claude_desktop_config.json" };
const vsCode = { client: "VS Code" as const, path: "C:\\Users\\me\\AppData\\Roaming\\Code\\User\\mcp.json" };

describe("legacy MCP setups", () => {
  it("recognises the sidecar connector and not the new one", () => {
    expect(isLegacyServer(legacy)).toBe(true);
    expect(isLegacyServer({ command: "D:/repo/api/PowerTools/PowerTools.API/bin/Debug/net9.0/powertools.api.exe" })).toBe(true);
    expect(isLegacyServer({ command: "dotnet", args: ["x.dll", "--mcp-connector"] })).toBe(true);
    expect(isLegacyServer(current)).toBe(false);
    expect(isLegacyServer({ type: "http", url: "http://127.0.0.1:1/mcp" })).toBe(false);
  });

  it("finds Claude Code servers at user and project scope", () => {
    const text = JSON.stringify({
      mcpServers: { powertools: legacy, other: { command: "node", args: ["x.js"] } },
      projects: { "D:\\work": { mcpServers: { pt: legacy } }, "D:\\new": { mcpServers: { powertools: current } } },
    });
    expect(findLegacySetups(claudeCode, text)).toEqual([
      { client: "Claude Code", configPath: claudeCode.path, server: "powertools", scope: "user" },
      { client: "Claude Code", configPath: claudeCode.path, server: "pt", scope: "D:\\work" },
    ]);
  });

  it("finds Claude Desktop and VS Code servers under their own keys", () => {
    expect(findLegacySetups(claudeDesktop, JSON.stringify({ mcpServers: { powertools: legacy } }))).toEqual([
      { client: "Claude Desktop", configPath: claudeDesktop.path, server: "powertools" },
    ]);
    expect(findLegacySetups(vsCode, JSON.stringify({ servers: { powertools: { type: "stdio", ...legacy } } }))).toEqual([
      { client: "VS Code", configPath: vsCode.path, server: "powertools" },
    ]);
    expect(findLegacySetups(vsCode, JSON.stringify({ mcpServers: { powertools: legacy } }))).toEqual([]);
  });

  it("finds nothing in an updated, broken, or missing config", async () => {
    expect(findLegacySetups(claudeCode, JSON.stringify({ mcpServers: { powertools: current } }))).toEqual([]);
    expect(findLegacySetups(claudeCode, "{ not json")).toEqual([]);
    expect(findLegacySetups(claudeCode, "[]")).toEqual([]);

    const files = knownClientConfigs({ homeDir: "C:\\Users\\me", appData: "C:\\Users\\me\\AppData\\Roaming" });
    const texts: Record<string, string> = {
      [files[1].path]: JSON.stringify({ mcpServers: { powertools: legacy } }),
    };
    const read = async (path: string) => {
      if (path in texts) return texts[path];
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    };
    expect(await scanLegacySetups(files, read)).toEqual([
      { client: "Claude Desktop", configPath: files[1].path, server: "powertools" },
    ]);
  });
});
