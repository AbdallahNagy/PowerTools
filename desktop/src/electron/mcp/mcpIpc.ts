// IPC for the Agents dialog: show the MCP server's state, switch it on or off, and read recent activity.
// Only the main window may ask. Results never carry the token or a connection id.
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import type { ActivityEntry } from "./activityLog.js";
import { connectorCommandLine, type ConnectorLaunch } from "./connectorCommand.js";
import type { McpService, McpStatus } from "./mcpService.js";
import { AGENT_TOOL_GROUPS, type AgentToolGroup } from "./types.js";

export type McpStatusInfo = McpStatus & {
  connectorCommand: string;
  connector: ConnectorLaunch;
  recent: ActivityEntry[];
};

export interface McpIpcDeps {
  ipcMain: Pick<IpcMain, "handle">;
  service: Pick<McpService, "status" | "setEnabled" | "setGroup" | "recentActivity" | "respondApproval">;
  getMainWindow: () => BrowserWindow | null;
  connector: () => ConnectorLaunch;
}

const RECENT_IN_STATUS = 50;

export function registerMcpIpc({ ipcMain, service, getMainWindow, connector }: McpIpcDeps) {
  function assertMainWindow(event: IpcMainInvokeEvent): void {
    const window = getMainWindow();
    if (!window || event.sender !== window.webContents) {
      throw new Error("Agent settings are only available from the main window");
    }
  }

  async function statusInfo(status: McpStatus): Promise<McpStatusInfo> {
    const launch = connector();
    return {
      ...status,
      connectorCommand: connectorCommandLine(launch),
      connector: launch,
      recent: await service.recentActivity(RECENT_IN_STATUS),
    };
  }

  ipcMain.handle("mcp-get-status", async (event) => {
    assertMainWindow(event);
    return statusInfo(service.status());
  });

  ipcMain.handle("mcp-set-enabled", async (event, enabled: unknown) => {
    assertMainWindow(event);
    if (typeof enabled !== "boolean") throw new Error("Enabled must be true or false");
    return statusInfo(await service.setEnabled(enabled));
  });

  ipcMain.handle("mcp-set-group", async (event, group: unknown, enabled: unknown) => {
    assertMainWindow(event);
    if (typeof group !== "string" || !AGENT_TOOL_GROUPS.includes(group as AgentToolGroup)) {
      throw new Error("Group must be one of: " + AGENT_TOOL_GROUPS.join(", "));
    }
    if (typeof enabled !== "boolean") throw new Error("Enabled must be true or false");
    return statusInfo(service.setGroup(group as AgentToolGroup, enabled));
  });

  ipcMain.handle("mcp-approval-respond", async (event, id: unknown, allow: unknown) => {
    assertMainWindow(event);
    if (typeof id !== "string" || id.length === 0 || id.length > 100) throw new Error("A request id is required");
    if (typeof allow !== "boolean") throw new Error("The answer must be true or false");
    service.respondApproval(id, allow);
  });

  ipcMain.handle("mcp-get-activity", async (event, limit: unknown) => {
    assertMainWindow(event);
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error("Limit must be a whole number from 1 to 500");
    }
    return service.recentActivity(limit);
  });
}
