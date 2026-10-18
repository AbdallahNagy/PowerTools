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

export type DesktopBridgeOverrides = {
  [Method in keyof DesktopBridge]?: DesktopBridge[Method];
};

export interface FakeDesktopBridge extends DesktopBridge {
  emitConnectionStatusUpdate(id: string | null): void;
  emitConnectionsUpdated(connections: ConnectionList): void;
  emitUpdateStatusChanged(status: UpdateStatus): void;
  emitWindowMaximizedChanged(maximized: boolean): void;
}

export function createFakeDesktopBridge(overrides: DesktopBridgeOverrides = {}): FakeDesktopBridge {
  const connectionStatusListeners = new Set<ConnectionStatusListener>();
  const connectionsUpdatedListeners = new Set<ConnectionsUpdatedListener>();
  const updateStatusChangedListeners = new Set<UpdateStatusChangedListener>();
  const windowMaximizedChangedListeners = new Set<WindowMaximizedChangedListener>();

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
