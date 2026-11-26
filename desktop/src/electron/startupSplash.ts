import { BrowserWindow } from "electron";
import { getAppIconPath } from "./pathResolver.js";
import { buildStartupSplashHtml } from "./startupSplashHtml.js";
import { currentColorScheme, windowBackgroundColor } from "./theme.js";

export function createStartupSplashWindow() {
  const splashWindow = new BrowserWindow({
    width: 480,
    height: 300,
    frame: false,
    resizable: false,
    movable: true,
    show: false,
    center: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: windowBackgroundColor("canvas"),
    icon: getAppIconPath(),
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
    `data:text/html;charset=utf-8,${encodeURIComponent(
      buildStartupSplashHtml(currentColorScheme() === "dark-orange" ? "dark-orange" : "default")
    )}`
  );

  return splashWindow;
}
