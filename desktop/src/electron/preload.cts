const electron = require("electron");

electron.contextBridge.exposeInMainWorld("electron", {
  getStaticData: () => console.log("This is static data from preload script"),
});
