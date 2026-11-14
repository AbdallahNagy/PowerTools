import type { DesktopBridge } from "../../src/ui/platform/desktopBridge";
import type { ConnectionSummary } from "../../src/ui/shared/connections/types";

/**
 * A connection from before organizations, shown by its old name. The id is the
 * name too, so tests can keep using one string for both.
 */
export function legacyConnection(
  name: string,
  envUrl: string,
  crmType: ConnectionSummary["crmType"] = "online",
): ConnectionSummary {
  return {
    id: name,
    legacyName: name,
    organization: null,
    environment: null,
    browser: null,
    envUrl,
    crmType,
    needsPassword: false,
  };
}

/** A connection described by organization and environment. */
export function describedConnection(
  id: string,
  organization: string,
  environment: string,
  envUrl: string,
  overrides: Partial<ConnectionSummary> = {},
): ConnectionSummary {
  return {
    id,
    legacyName: null,
    organization,
    environment,
    browser: null,
    envUrl,
    crmType: "online",
    needsPassword: false,
    ...overrides,
  };
}

type ConnectionStatusListener = Parameters<DesktopBridge["onConnectionStatusUpdate"]>[0];
type ConnectionsUpdatedListener = Parameters<DesktopBridge["onConnectionsUpdated"]>[0];
type UpdateStatusChangedListener = Parameters<DesktopBridge["onUpdateStatusChanged"]>[0];
type WindowMaximizedChangedListener = Parameters<DesktopBridge["onWindowMaximizedChanged"]>[0];
type ConnectionList = Awaited<ReturnType<DesktopBridge["listConnections"]>>;
type UpdateStatus = Awaited<ReturnType<DesktopBridge["getUpdateStatus"]>>;

const offlineMcpStatus: Awaited<ReturnType<DesktopBridge["getMcpStatus"]>> = {
  enabled: false,
  running: false,
  port: null,
  discoveryPath: "/users/test/power-tools/mcp-endpoint.json",
  error: null,
  connectorCommand: '"/program files/power-tools/api/PowerTools.API.exe" --mcp-connector',
  connector: { command: "/program files/power-tools/api/PowerTools.API.exe", args: ["--mcp-connector"] },
  recent: [],
  groups: [
    { group: "connections", enabled: true, tools: 1 },
    { group: "metadata", enabled: true, tools: 7 },
    { group: "records", enabled: true, tools: 8 },
  ],
  tools: [
    { name: "connections_list", title: "List connections", description: "Lists saved connections. Read-only.", group: "connections", effect: "read", enabled: true },
    { name: "metadata_tables", title: "List tables", description: "Lists tables. Read-only.", group: "metadata", effect: "read", enabled: true },
    { name: "records_delete", title: "Delete a record", description: "Destructive: deletes a record.", group: "records", effect: "destructive", enabled: true },
  ],
  http: { enabled: false, port: 47800 },
};

export type DesktopBridgeOverrides = {
  [Method in keyof DesktopBridge]?: DesktopBridge[Method];
};

export interface FakeDesktopBridge extends DesktopBridge {
  emitConnectionStatusUpdate(id: string | null): void;
  emitConnectionsUpdated(connections: ConnectionList): void;
  emitUpdateStatusChanged(status: UpdateStatus): void;
  emitWindowMaximizedChanged(maximized: boolean): void;
  emitOpenCommunityTools(): void;
  emitOpenAgents(): void;
  emitOpenSettings(): void;
  emitAppSettingsChanged(): void;
}

export function createFakeDesktopBridge(overrides: DesktopBridgeOverrides = {}): FakeDesktopBridge {
  const connectionStatusListeners = new Set<ConnectionStatusListener>();
  const connectionsUpdatedListeners = new Set<ConnectionsUpdatedListener>();
  const updateStatusChangedListeners = new Set<UpdateStatusChangedListener>();
  const windowMaximizedChangedListeners = new Set<WindowMaximizedChangedListener>();
  const openCommunityToolsListeners = new Set<() => void>();
  const openAgentsListeners = new Set<() => void>();
  const openSettingsListeners = new Set<() => void>();
  const appSettingsChangedListeners = new Set<() => void>();
  let appSettings: Awaited<ReturnType<DesktopBridge["getAppSettings"]>> = {
    theme: "system",
    usageStats: true,
    crashReports: true,
    version: "1.2.3",
    updatesEnabled: true,
  };

  const bridge: DesktopBridge = {
    createConnectionWindow: async () => undefined,
    saveConnectionData: async () => ({ success: true }),
    getPendingConnection: async () => null,
    saveConnectionDetails: async () => ({ success: true }),
    onConnectionStatusUpdate: (callback) => {
      connectionStatusListeners.add(callback);
    },
    onConnectionsUpdated: (callback) => {
      connectionsUpdatedListeners.add(callback);
      return () => connectionsUpdatedListeners.delete(callback);
    },
    listConnections: async () => [],
    getConnection: async () => ({ error: "Connection not found" }),
    setActiveConnection: async () => ({ success: true }),
    deleteConnection: async () => ({ success: true }),
    updateConnection: async () => ({ success: true }),
    getActiveConnectionId: async () => null,
    getActiveConnection: async () => ({ error: "No active connection" }),
    refreshToken: async () => ({ error: "No active connection" }),
    openConnectionManager: async () => undefined,
    takeConnectionManagerRequest: async () => null,
    onConnectionManagerRequest: () => () => undefined,
    listBrowsers: async () => [],
    openUrlForConnection: async () => ({ fallback: false }),
    openUrlInBrowser: async () => ({ fallback: false }),
    exportConnections: async () => ({ success: true, count: 0 }),
    previewConnectionImport: async () => null,
    commitConnectionImport: async () => ({ success: true, imported: 0 }),
    getApiBaseUrl: async () => "http://localhost",
    getLocalSecret: async () => "",
    getAppVersion: async () => "0.0.0-test",
    getUpdateStatus: async () => ({ state: "idle" }),
    checkForUpdates: async () => undefined,
    downloadUpdate: async () => undefined,
    installUpdate: async () => undefined,
    onUpdateStatusChanged: (callback) => {
      updateStatusChangedListeners.add(callback);
      return () => updateStatusChangedListeners.delete(callback);
    },
    openExternalUrl: async () => undefined,
    popupAppMenu: async () => undefined,
    minimizeWindow: async () => undefined,
    toggleMaximizeWindow: async () => undefined,
    closeWindow: async () => undefined,
    isWindowMaximized: async () => false,
    onWindowMaximizedChanged: (callback) => {
      windowMaximizedChangedListeners.add(callback);
      return () => windowMaximizedChangedListeners.delete(callback);
    },
    listCommunityTools: async () => [],
    addCommunityToolFromFolder: async () => null,
    removeCommunityTool: async () => undefined,
    grantCommunityToolConsent: async () => undefined,
    readCommunityToolStorage: async () => ({}),
    writeCommunityToolStorage: async () => undefined,
    getCommunityToolBundleSize: async () => ({ bytes: 0, files: 0 }),
    openFileForCommunityTool: async () => null,
    saveFileForCommunityTool: async () => false,
    onOpenCommunityTools: (callback) => {
      openCommunityToolsListeners.add(callback);
      return () => openCommunityToolsListeners.delete(callback);
    },
    getMcpStatus: async () => offlineMcpStatus,
    setMcpEnabled: async (enabled) => ({ ...offlineMcpStatus, enabled, running: enabled, port: enabled ? 51234 : null }),
    getMcpActivity: async () => [],
    setMcpHttp: async (http) => ({ ...offlineMcpStatus, http }),
    copyMcpHttpConfig: async () => undefined,
    regenerateMcpHttpToken: async () => offlineMcpStatus,
    setMcpGroup: async (group, enabled) => ({
      ...offlineMcpStatus,
      groups: offlineMcpStatus.groups.map((g) => (g.group === group ? { ...g, enabled } : g)),
    }),
    setMcpTool: async (name, enabled) => ({
      ...offlineMcpStatus,
      tools: offlineMcpStatus.tools.map((t) => (t.name === name ? { ...t, enabled } : t)),
    }),
    onOpenSettings: (callback) => {
      openSettingsListeners.add(callback);
      return () => openSettingsListeners.delete(callback);
    },
    onAppSettingsChanged: (callback) => {
      appSettingsChangedListeners.add(callback);
      return () => appSettingsChangedListeners.delete(callback);
    },
    getAppSettings: async () => appSettings,
    setThemePreference: async (theme) => (appSettings = { ...appSettings, theme }),
    setUsageStatsEnabled: async (usageStats) => (appSettings = { ...appSettings, usageStats }),
    setCrashReportsEnabled: async (crashReports) => (appSettings = { ...appSettings, crashReports }),
    openSettingsFolder: async () => undefined,
    onMcpApprovalPresent: () => () => undefined,
    onMcpApprovalDismiss: () => () => undefined,
    respondMcpApproval: async () => undefined,
    onOpenAgents: (callback) => {
      openAgentsListeners.add(callback);
      return () => openAgentsListeners.delete(callback);
    },
    ...overrides,
  };

  return {
    ...bridge,
    emitConnectionStatusUpdate: (id) => {
      connectionStatusListeners.forEach((listener) => listener(id));
    },
    emitConnectionsUpdated: (connections) => {
      connectionsUpdatedListeners.forEach((listener) => listener(connections));
    },
    emitUpdateStatusChanged: (status) => {
      updateStatusChangedListeners.forEach((listener) => listener(status));
    },
    emitWindowMaximizedChanged: (maximized) => {
      windowMaximizedChangedListeners.forEach((listener) => listener(maximized));
    },
    emitOpenCommunityTools: () => {
      openCommunityToolsListeners.forEach((listener) => listener());
    },
    emitOpenAgents: () => {
      openAgentsListeners.forEach((listener) => listener());
    },
    emitOpenSettings: () => {
      openSettingsListeners.forEach((listener) => listener());
    },
    emitAppSettingsChanged: () => {
      appSettingsChangedListeners.forEach((listener) => listener());
    },
  };
}

export function installDesktopBridge(bridge: DesktopBridge): DesktopBridge {
  Object.defineProperty(window, "electron", {
    configurable: true,
    value: bridge,
    writable: true,
  });

  return bridge;
}
