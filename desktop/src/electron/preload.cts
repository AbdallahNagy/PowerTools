const electron = require("electron");
const { createPreloadApi } = require("./preloadApi.cjs");

electron.contextBridge.exposeInMainWorld(
  "electron",
  createPreloadApi(electron.ipcRenderer),
);
