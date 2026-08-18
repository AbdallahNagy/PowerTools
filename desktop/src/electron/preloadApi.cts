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
    saveConnectionName: (name: string) =>
      ipcRenderer.invoke("save-connection-name", name),
    onConnectionStatusUpdate: (callback: (name: string | null) => void) => {
      ipcRenderer.on(
        "connection-status-update",
        (_: unknown, name: string | null) => callback(name),
      );
    },
    onConnectionsUpdated: (callback: (connections: any[]) => void) => {
      const listener = (_: unknown, connections: any[]) => callback(connections);
      ipcRenderer.on("connections-updated", listener);
      return () => ipcRenderer.removeListener("connections-updated", listener);
    },
    listConnections: () =>
      ipcRenderer.invoke("list-connections"),
    getConnection: (name: string) =>
      ipcRenderer.invoke("get-connection", name),
    setActiveConnection: (name: string) =>
      ipcRenderer.invoke("set-active-connection", name),
    deleteConnection: (name: string) =>
      ipcRenderer.invoke("delete-connection", name),
    // Back-compat
    getActiveConnection: () =>
      ipcRenderer.invoke("get-active-connection"),
    refreshToken: () => ipcRenderer.invoke("refresh-token"),

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
  };
}

export type PreloadApi = ReturnType<typeof createPreloadApi>;
