import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  bundledConnectorFolder,
  connectorCommandLine,
  connectorInstallFolder,
  connectorLaunch,
} from "../../src/electron/mcp/connectorCommand";
import { registerMcpIpc } from "../../src/electron/mcp/mcpIpc";
import type { McpStatus } from "../../src/electron/mcp/mcpService";

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>;

function setup() {
  const handlers = new Map<string, Handler>();
  const mainContents = { id: 1 };
  const status: McpStatus = { enabled: false, running: false, port: null, discoveryPath: "C:\\u\\mcp-endpoint.json", error: null, groups: [], tools: [] };
  const service = {
    status: vi.fn(() => status),
    setEnabled: vi.fn(async (enabled: boolean) => ({ ...status, enabled, running: enabled, port: enabled ? 5000 : null })),
    recentActivity: vi.fn(async () => []),
    respondApproval: vi.fn(),
    pendingApproval: vi.fn(() => ({ id: "req-1", tool: "table_apply" }) as never),
    setTool: vi.fn((name: string, enabled: boolean) => ({
      ...status,
      tools: [{ name, title: "T", description: "Read-only.", group: "records" as never, effect: "read" as const, perCall: false, enabled }],
    })),
    setGroup: vi.fn((group: string, enabled: boolean) => ({
      ...status,
      groups: [{ group: group as never, enabled, tools: 3 }],
    })),
  };
  registerMcpIpc({
    ipcMain: { handle: (channel: string, handler: Handler) => void handlers.set(channel, handler) } as never,
    service,
    getMainWindow: () => ({ webContents: mainContents }) as never,
    connector: () => ({ command: "C:\\Users\\me\\AppData\\Local\\Dyno\\mcp\\Dyno.McpConnector.exe", args: [] }),
  });
  const call = (channel: string, sender: unknown, ...args: unknown[]) => handlers.get(channel)!({ sender }, ...args);
  return { call, handlers, mainContents, service };
}

describe("mcp IPC", () => {
  it("returns status with the connector command and recent activity", async () => {
    const { call, mainContents } = setup();
    const info = (await call("mcp-get-status", mainContents)) as Record<string, unknown>;
    expect(info).toMatchObject({ enabled: false, running: false, recent: [] });
    expect(info.connectorCommand).toBe("C:\\Users\\me\\AppData\\Local\\Dyno\\mcp\\Dyno.McpConnector.exe");
  });

  it("rejects a foreign sender on every channel", async () => {
    const { call } = setup();
    const foreign = { id: 2 };
    await expect(call("mcp-get-status", foreign)).rejects.toThrow(/main window/);
    await expect(call("mcp-set-enabled", foreign, true)).rejects.toThrow(/main window/);
    await expect(call("mcp-get-activity", foreign, 10)).rejects.toThrow(/main window/);
  });

  it("rejects a non-boolean enabled value without changing anything", async () => {
    const { call, mainContents, service } = setup();
    await expect(call("mcp-set-enabled", mainContents, "yes")).rejects.toThrow(/true or false/);
    expect(service.setEnabled).not.toHaveBeenCalled();
  });

  it("switches the server on", async () => {
    const { call, mainContents, service } = setup();
    expect(await call("mcp-set-enabled", mainContents, true)).toMatchObject({ enabled: true, running: true });
    expect(service.setEnabled).toHaveBeenCalledWith(true);
  });

  it.each([0, 501, 1.5, "10", null])("rejects activity limit %j", async (limit) => {
    const { call, mainContents } = setup();
    await expect(call("mcp-get-activity", mainContents, limit)).rejects.toThrow(/Limit/);
  });

  it("reads activity for a valid limit", async () => {
    const { call, mainContents, service } = setup();
    await call("mcp-get-activity", mainContents, 20);
    expect(service.recentActivity).toHaveBeenCalledWith(20);
  });
});

describe("mcp direct HTTP option", () => {
  it("registers no channel for it", () => {
    const { handlers } = setup();
    for (const channel of ["mcp-set-http", "mcp-copy-http-config", "mcp-regenerate-http-token"]) {
      expect(handlers.has(channel)).toBe(false);
    }
  });
});

describe("mcp group IPC", () => {
  it("switches a group and returns the new status", async () => {
    const { call, mainContents, service } = setup();
    const info = (await call("mcp-set-group", mainContents, "schema", false)) as { groups: Array<{ group: string; enabled: boolean }> };
    expect(service.setGroup).toHaveBeenCalledWith("schema", false);
    expect(info.groups).toEqual([{ group: "schema", enabled: false, tools: 3 }]);
  });

  it.each(["", "nonsense", "__proto__", 5, null])("rejects the group %j", async (group) => {
    const { call, mainContents, service } = setup();
    await expect(call("mcp-set-group", mainContents, group, true)).rejects.toThrow(/Group must be one of/);
    expect(service.setGroup).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean and a foreign sender", async () => {
    const { call, mainContents, service } = setup();
    await expect(call("mcp-set-group", mainContents, "schema", "off")).rejects.toThrow(/true or false/);
    await expect(call("mcp-set-group", { id: 2 }, "schema", true)).rejects.toThrow(/main window/);
    expect(service.setGroup).not.toHaveBeenCalled();
  });
});

describe("mcp approval IPC", () => {
  it("passes the answer to the service", async () => {
    const { call, mainContents, service } = setup();
    await call("mcp-approval-respond", mainContents, "req-1", true);
    expect(service.respondApproval).toHaveBeenCalledWith("req-1", true);
  });

  it("rejects a foreign sender, and bad ids or answers, without answering anything", async () => {
    const { call, mainContents, service } = setup();
    await expect(call("mcp-approval-respond", { id: 2 }, "req-1", true)).rejects.toThrow(/main window/);
    await expect(call("mcp-approval-respond", mainContents, 5, true)).rejects.toThrow(/id/);
    await expect(call("mcp-approval-respond", mainContents, "req-1", "yes")).rejects.toThrow(/true or false/);
    expect(service.respondApproval).not.toHaveBeenCalled();
  });

  it("hands the main window the request on screen, and nobody else", async () => {
    const { call, mainContents } = setup();
    await expect(call("mcp-approval-pending", mainContents)).resolves.toMatchObject({ id: "req-1" });
    await expect(call("mcp-approval-pending", { id: 2 })).rejects.toThrow(/main window/);
  });
});

describe("connectorLaunch", () => {
  const localMcp = "C:\\Users\\me\\AppData\\Local\\Dyno\\mcp";

  it("points at the per-user copy of the connector, not the install folder", () => {
    const launch = connectorLaunch({
      packaged: true,
      platform: "win32",
      resourcesPath: resolve("/app/resources"),
      appPath: resolve("/app"),
      discoveryPath: "x",
      connectorDir: localMcp,
    });
    expect(launch.command.startsWith(localMcp)).toBe(true);
    expect(launch.command.endsWith("Dyno.McpConnector.exe")).toBe(true);
    expect(launch.command).not.toContain("resources");
    expect(launch.args).toEqual([]);
  });

  it("passes the dev discovery path to the dev copy", () => {
    const launch = connectorLaunch({
      packaged: false,
      platform: "win32",
      resourcesPath: "",
      appPath: resolve("/repo/desktop"),
      discoveryPath: "C:\\Users\\me\\AppData\\Roaming\\Dyno Dev\\mcp-endpoint.json",
      connectorDir: connectorInstallFolder("C:\\Users\\me\\AppData\\Local", "Dyno Dev"),
    });
    expect(launch.command).toContain("Dyno Dev");
    expect(launch.args).toEqual(["--discovery", "C:\\Users\\me\\AppData\\Roaming\\Dyno Dev\\mcp-endpoint.json"]);
    expect(connectorCommandLine(launch)).toContain('--discovery "C:\\Users');
  });

  it("copies from the bundled connector, or the dev build", () => {
    expect(bundledConnectorFolder({ packaged: true, resourcesPath: resolve("/app/resources"), appPath: "" })).toBe(
      resolve("/app/resources/mcp-connector"),
    );
    expect(bundledConnectorFolder({ packaged: false, resourcesPath: "", appPath: resolve("/repo/desktop") })).toBe(
      resolve("/repo/api/Dyno/Dyno.McpConnector/bin/Debug/net9.0"),
    );
  });

  it("switches one tool and validates its input", async () => {
    const { call, mainContents, service } = setup();
    const info = (await call("mcp-set-tool", mainContents, "records_delete", false)) as { tools: Array<{ name: string; enabled: boolean }> };
    expect(info.tools).toEqual([expect.objectContaining({ name: "records_delete", enabled: false })]);
    expect(service.setTool).toHaveBeenCalledWith("records_delete", false);
    await expect(call("mcp-set-tool", mainContents, "", false)).rejects.toThrow(/tool name/);
    await expect(call("mcp-set-tool", mainContents, "x".repeat(65), false)).rejects.toThrow(/tool name/);
    await expect(call("mcp-set-tool", mainContents, "records_delete", "off")).rejects.toThrow(/true or false/);
    await expect(call("mcp-set-tool", { id: 2 }, "records_delete", true)).rejects.toThrow(/main window/);
    expect(service.setTool).toHaveBeenCalledTimes(1);
  });
});
