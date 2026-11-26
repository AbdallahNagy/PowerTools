import { BrowserWindow } from "electron";
import { getAppIconPath } from "./pathResolver.js";
import { buildStartupSplashHtml, startupSplashTimeLeft } from "./startupSplashHtml.js";
import { currentColorScheme, windowBackgroundColor } from "./theme.js";

const splashStartedAt = new WeakMap<BrowserWindow, number>();

/**
 * Resolves once the splash has played its whole animation, so a fast start still shows it.
 * A slow start has already waited long enough and resolves at once.
 */
export function waitForStartupSplash(splashWindow: BrowserWindow, now = Date.now()) {
  const startedAt = splashStartedAt.get(splashWindow);
  const timeLeft = splashWindow.isDestroyed() || startedAt === undefined ? 0 : startupSplashTimeLeft(startedAt, now);
  return new Promise<void>((resolve) => setTimeout(resolve, timeLeft));
}

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

  splashStartedAt.set(splashWindow, Date.now());
  void splashWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(
      buildStartupSplashHtml(currentColorScheme() === "dark-orange" ? "dark-orange" : "default")
    )}`
  );

  return splashWindow;
}
