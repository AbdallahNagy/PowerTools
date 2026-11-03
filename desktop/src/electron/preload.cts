// Bridges renderer crash reports to the main process over IPC.
require("@sentry/electron/preload");
const electron = require("electron");
const { createPreloadApi } = require("./preloadApi.cjs");

electron.contextBridge.exposeInMainWorld(
  "electron",
  createPreloadApi(electron.ipcRenderer),
);

// PROTOTYPE (issue #101): contextBridge cannot pass MessagePorts, so the
// Host API port reaches the shell's main world through window.postMessage.
electron.contextBridge.exposeInMainWorld("prototypeTools", {
  open: (toolId: string, instanceId: string, connectionId: string | null) =>
    electron.ipcRenderer.invoke("prototype-tool-open", { toolId, instanceId, connectionId }),
  frames: () => electron.ipcRenderer.invoke("prototype-tool-frames"),
});
electron.ipcRenderer.on("prototype-tool-port", (event: { ports: MessagePort[] }, data: { instanceId: string }) => {
  window.postMessage({ type: "prototype-tool-port", instanceId: data.instanceId }, window.location.origin, event.ports);
});
