import { BrowserWindow } from "electron";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAppIconPath } from "./pathResolver.js";
import { buildStartupSplashHtml } from "./startupSplashHtml.js";

function getStartupIconDataUrl() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const iconPaths = [
    getAppIconPath(),
    join(
      __dirname,
      "..",
      "src",
      "ui",
      "assets",
      "icons",
      "power-tools-preview-256.png"
    ),
  ];

  for (const iconPath of iconPaths) {
    try {
      const icon = readFileSync(iconPath);
      return `data:image/png;base64,${icon.toString("base64")}`;
    } catch {
      // Try the next known runtime location before falling back to text.
    }
  }

  return undefined;
}

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
      buildStartupSplashHtml(getStartupIconDataUrl())
    )}`
  );

  return splashWindow;
}
