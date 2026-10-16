import type { IpcRenderer } from "electron";

export type PreloadIpcRenderer = Pick<
  IpcRenderer,
  "invoke" | "on" | "removeListener"
>;

export function createPreloadApi(ipcRenderer: PreloadIpcRenderer) {
  return {
    createConnectionWindow: () =>
      ipcRenderer.invoke("create-connection-window"),
    saveConnectionData: (data: any) =>
      ipcRenderer.invoke("save-connection-data", data),
    getPendingConnection: () =>
      ipcRenderer.invoke("get-pending-connection"),
    saveConnectionDetails: (description: any) =>
      ipcRenderer.invoke("save-connection-details", description),
    onConnectionStatusUpdate: (callback: (id: string | null) => void) => {
      ipcRenderer.on(
        "connection-status-update",
        (_: unknown, id: string | null) => callback(id),
      );
    },
    onConnectionsUpdated: (callback: (connections: any[]) => void) => {
      const listener = (_: unknown, connections: any[]) => callback(connections);
      ipcRenderer.on("connections-updated", listener);
      return () => ipcRenderer.removeListener("connections-updated", listener);
    },
    listConnections: () =>
      ipcRenderer.invoke("list-connections"),
    getConnection: (id: string) =>
      ipcRenderer.invoke("get-connection", id),
    setActiveConnection: (id: string) =>
      ipcRenderer.invoke("set-active-connection", id),
    deleteConnection: (id: string) =>
      ipcRenderer.invoke("delete-connection", id),
    updateConnection: (id: string, update: any) =>
      ipcRenderer.invoke("update-connection", id, update),
    getActiveConnectionId: () =>
      ipcRenderer.invoke("get-active-connection-id"),
    // Back-compat
    getActiveConnection: () =>
      ipcRenderer.invoke("get-active-connection"),
    refreshToken: () => ipcRenderer.invoke("refresh-token"),
    openConnectionManager: (id?: string | null) =>
      ipcRenderer.invoke("open-connection-manager", id ?? null),
    takeConnectionManagerSelection: () =>
      ipcRenderer.invoke("take-connection-manager-selection"),
    onConnectionManagerSelect: (callback: (id: string) => void) => {
      const listener = (_: unknown, id: string) => callback(id);
      ipcRenderer.on("connection-manager-select", listener);
      return () => ipcRenderer.removeListener("connection-manager-select", listener);
    },
    listBrowsers: () => ipcRenderer.invoke("list-browsers"),
    openUrlForConnection: (id: string | null, url: string) =>
      ipcRenderer.invoke("open-url-for-connection", id, url),
    openUrlInBrowser: (browser: any, url: string) =>
      ipcRenderer.invoke("open-url-in-browser", browser, url),
    exportConnections: (ids?: string[]) =>
      ipcRenderer.invoke("export-connections", ids ?? null),
    previewConnectionImport: () =>
      ipcRenderer.invoke("preview-connection-import"),
    commitConnectionImport: (keys: string[]) =>
      ipcRenderer.invoke("commit-connection-import", keys),

    // Local sidecar API bootstrap. Both values are resolved once per renderer
    // load and cached in the api/client module.
    getApiBaseUrl: () => ipcRenderer.invoke("get-api-base-url"),
    getLocalSecret: () => ipcRenderer.invoke("get-local-secret"),
    getAppVersion: () => ipcRenderer.invoke("get-app-version"),
    getUpdateStatus: () => ipcRenderer.invoke("get-update-status"),
    checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
    downloadUpdate: () => ipcRenderer.invoke("download-update"),
    installUpdate: () => ipcRenderer.invoke("install-update"),
    onUpdateStatusChanged: (callback: (status: any) => void) => {
      const listener = (_: unknown, status: any) => callback(status);
      ipcRenderer.on("update-status-changed", listener);
      return () => ipcRenderer.removeListener("update-status-changed", listener);
    },
    openExternalUrl: (url: string) =>
      ipcRenderer.invoke("open-external-url", url),
    popupAppMenu: (menuId: string, x: number, y: number) =>
      ipcRenderer.invoke("popup-app-menu", menuId, x, y),
    minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
    toggleMaximizeWindow: () => ipcRenderer.invoke("window-toggle-maximize"),
    closeWindow: () => ipcRenderer.invoke("window-close"),
    isWindowMaximized: () => ipcRenderer.invoke("window-is-maximized"),
    onWindowMaximizedChanged: (callback: (maximized: boolean) => void) => {
      const listener = (_: unknown, maximized: boolean) => callback(maximized);
      ipcRenderer.on("window-maximized-changed", listener);
      return () => ipcRenderer.removeListener("window-maximized-changed", listener);
    },
  };
}

export type PreloadApi = ReturnType<typeof createPreloadApi>;
