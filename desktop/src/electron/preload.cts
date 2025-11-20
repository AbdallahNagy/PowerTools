const electron = require("electron");

electron.contextBridge.exposeInMainWorld("electron", {
  getStaticData: () => console.log("This is static data from preload script"),
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
});
