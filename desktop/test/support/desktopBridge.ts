import type { DesktopBridge } from "../../src/ui/platform/desktopBridge";

type ConnectionStatusListener = Parameters<DesktopBridge["onConnectionStatusUpdate"]>[0];
type ConnectionsUpdatedListener = Parameters<DesktopBridge["onConnectionsUpdated"]>[0];
type UpdateStatusChangedListener = Parameters<DesktopBridge["onUpdateStatusChanged"]>[0];
type ConnectionList = Awaited<ReturnType<DesktopBridge["listConnections"]>>;
type UpdateStatus = Awaited<ReturnType<DesktopBridge["getUpdateStatus"]>>;

export type DesktopBridgeOverrides = {
  [Method in keyof DesktopBridge]?: DesktopBridge[Method];
};

export interface FakeDesktopBridge extends DesktopBridge {
  emitConnectionStatusUpdate(name: string | null): void;
  emitConnectionsUpdated(connections: ConnectionList): void;
  emitUpdateStatusChanged(status: UpdateStatus): void;
}

export function createFakeDesktopBridge(overrides: DesktopBridgeOverrides = {}): FakeDesktopBridge {
  const connectionStatusListeners = new Set<ConnectionStatusListener>();
  const connectionsUpdatedListeners = new Set<ConnectionsUpdatedListener>();
  const updateStatusChangedListeners = new Set<UpdateStatusChangedListener>();

  const bridge: DesktopBridge = {
    createConnectionWindow: async () => undefined,
    saveConnectionData: async () => ({ success: true }),
    saveConnectionName: async () => undefined,
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
    getActiveConnection: async () => ({ error: "No active connection" }),
    refreshToken: async () => ({ error: "No active connection" }),
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
    ...overrides,
  };

  return {
    ...bridge,
    emitConnectionStatusUpdate: (name) => {
      connectionStatusListeners.forEach((listener) => listener(name));
    },
    emitConnectionsUpdated: (connections) => {
      connectionsUpdatedListeners.forEach((listener) => listener(connections));
    },
    emitUpdateStatusChanged: (status) => {
      updateStatusChangedListeners.forEach((listener) => listener(status));
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
