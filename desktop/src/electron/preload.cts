// Bridges renderer crash reports to the main process over IPC.
require("@sentry/electron/preload");
const electron = require("electron");
const { createPreloadApi } = require("./preloadApi.cjs");

electron.contextBridge.exposeInMainWorld(
  "electron",
  createPreloadApi(electron.ipcRenderer),
);
