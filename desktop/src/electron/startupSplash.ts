import { BrowserWindow } from "electron";
import { buildStartupSplashHtml } from "./startupSplashHtml.js";

export function createStartupSplashWindow() {
  const splashWindow = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    resizable: false,
    movable: true,
    show: false,
    center: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: "#1e1e1e",
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
    },
  });

  splashWindow.once("ready-to-show", () => {
    if (!splashWindow.isDestroyed()) {
      splashWindow.show();
    }
  });

  void splashWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(buildStartupSplashHtml())}`
  );

  return splashWindow;
}
