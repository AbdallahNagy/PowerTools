const electron = require("electron");

electron.contextBridge.exposeInMainWorld("electron", {
  createConnectionWindow: () =>
    electron.ipcRenderer.invoke("create-connection-window"),
  saveConnectionData: (data: any) =>
    electron.ipcRenderer.invoke("save-connection-data", data),
  saveConnectionName: (name: string) =>
    electron.ipcRenderer.invoke("save-connection-name", name),
  onConnectionStatusUpdate: (callback: (name: string) => void) => {
    electron.ipcRenderer.on(
      "connection-status-update",
      (_: any, name: string) => callback(name)
    );
  },
  onConnectionsUpdated: (callback: (connections: any[]) => void) => {
    const listener = (_: any, connections: any[]) => callback(connections);
    electron.ipcRenderer.on("connections-updated", listener);
    return () => electron.ipcRenderer.removeListener("connections-updated", listener);
  },
  listConnections: () =>
    electron.ipcRenderer.invoke("list-connections"),
  getConnection: (name: string) =>
    electron.ipcRenderer.invoke("get-connection", name),
  setActiveConnection: (name: string) =>
    electron.ipcRenderer.invoke("set-active-connection", name),
  deleteConnection: (name: string) =>
    electron.ipcRenderer.invoke("delete-connection", name),
  // Back-compat
  getActiveConnection: () =>
    electron.ipcRenderer.invoke("get-active-connection"),
  refreshToken: () => electron.ipcRenderer.invoke("refresh-token"),

  // Local sidecar API bootstrap. Both values are resolved once per renderer
  // load and cached in the api/client module.
  getApiBaseUrl: () => electron.ipcRenderer.invoke("get-api-base-url"),
  getLocalSecret: () => electron.ipcRenderer.invoke("get-local-secret"),
});
