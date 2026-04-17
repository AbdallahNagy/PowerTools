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
    electron.ipcRenderer.on(
      "connections-updated",
      (_: any, connections: any[]) => callback(connections)
    );
  },
  listConnections: () =>
    electron.ipcRenderer.invoke("list-connections"),
  getConnection: (name: string) =>
    electron.ipcRenderer.invoke("get-connection", name),
  setActiveConnection: (name: string) =>
    electron.ipcRenderer.invoke("set-active-connection", name),
  // Back-compat
  getActiveConnection: () =>
    electron.ipcRenderer.invoke("get-active-connection"),
  refreshToken: () => electron.ipcRenderer.invoke("refresh-token"),
});
