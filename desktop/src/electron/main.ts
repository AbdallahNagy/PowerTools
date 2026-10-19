// Must load first: Sentry writes into userData, so dev runs switch folders before it starts.
import "./devUserData.js";
// Must load next so Sentry hooks the app before anything else runs.
import "./sentry.js";
import { spawn } from "child_process";
import { readFile, writeFile } from "fs/promises";
import { app, BrowserWindow, dialog, ipcMain, net, shell } from "electron";
import electronUpdater from "electron-updater";
import { isDev } from "./utils.js";
import { getAppIconPath, getPreloadPath } from "./pathResolver.js";
import { createStartupSplashWindow } from "./startupSplash.js";
import {
  configureAutoUpdates,
  shouldCheckForUpdates,
  type AutoUpdateController,
  type UpdateStatus,
} from "./autoUpdate.js";
import { loadState, saveState } from "./storage.js";
import * as sidecar from "./sidecar.js";
import { createConnectionStore } from "./connectionStore.js";
import { registerConnectionIpc } from "./connectionIpc.js";
import { listInstalledBrowsers, windowsBrowserEnvironment } from "./browserProfiles.js";
import { createBrowserLauncher, parseWebUrl } from "./browserLauncher.js";
import {
  configureMainWindowChrome,
  getMainWindowOptions,
  registerWindowChromeIpc,
  setConnectionsMenuHandlers,
} from "./windowChrome.js";
import { initializeTheme, windowBackgroundColor } from "./theme.js";
import { startUsageStats } from "./usageStats.js";

const { autoUpdater } = electronUpdater;

app.whenReady().then(async () => {
  const theme = initializeTheme();
  const splashWindow = createStartupSplashWindow();
  let updateStatus: UpdateStatus = { state: "idle" };
  let updateController: AutoUpdateController | null = null;

  // Start the local API process before any window opens. The renderer
  // assumes a working sidecar; if it fails to come up, the app cannot
  // function — surface the error and quit cleanly.
  let sidecarHandle: { baseUrl: string; secret: string };
  try {
    sidecarHandle = await sidecar.start();
  } catch (err) {
    if (!splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    dialog.showErrorBox(
      "PowerTools failed to start",
      `The local API process did not start.\n\n${(err as Error).message}`
    );
    app.quit();
    return;
  }

  app.on("before-quit", sidecar.stop);
  process.on("exit", sidecar.stop);

  ipcMain.handle("get-api-base-url", () => sidecarHandle.baseUrl);
  ipcMain.handle("get-local-secret", () => sidecarHandle.secret);
  ipcMain.handle("get-app-version", () => app.getVersion());
  ipcMain.handle("get-update-status", () => updateStatus);
  ipcMain.handle("check-for-updates", () => updateController?.checkForUpdates());
  ipcMain.handle("download-update", () => updateController?.downloadUpdate());
  ipcMain.handle("install-update", () => updateController?.quitAndInstall());
  ipcMain.handle("open-external-url", async (_event, url: unknown) => {
    await shell.openExternal(parseWebUrl(url));
  });
  registerWindowChromeIpc(ipcMain, theme);

  const store = createConnectionStore({ initial: loadState(), save: saveState });
  const browserEnvironment = windowsBrowserEnvironment();
  const launcher = createBrowserLauncher({
    listBrowsers: async () => (browserEnvironment ? listInstalledBrowsers(browserEnvironment) : []),
    spawn: (executable, args) =>
      spawn(executable, args, { detached: true, stdio: "ignore", windowsHide: false }),
    openExternal: (url) => shell.openExternal(url),
  });
  const connectionIpc = registerConnectionIpc({
    ipcMain,
    store,
    launcher,
    sidecar: sidecarHandle,
    files: {
      chooseSaveFile: async (window, defaultName) => {
        const options = {
          title: "Export connections",
          defaultPath: defaultName,
          filters: [{ name: "Power Tools connections", extensions: ["json"] }],
        };
        const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
        return result.canceled || !result.filePath ? null : result.filePath;
      },
      chooseOpenFile: async (window) => {
        const options = {
          title: "Import connections",
          properties: ["openFile" as const],
          filters: [
            { name: "Connections", extensions: ["json", "xml"] },
            { name: "All files", extensions: ["*"] },
          ],
        };
        const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
        return result.canceled ? null : result.filePaths[0] ?? null;
      },
      readFile: (path) => readFile(path, "utf-8"),
      writeFile: (path, content) => writeFile(path, content, "utf-8"),
    },
    getMainWindow: () => mainWindow,
    openWindow: (route, { width, height, minWidth, minHeight, resizable }) => {
      const window = new BrowserWindow({
        webPreferences: {
          preload: getPreloadPath(),
        },
        width,
        height,
        minWidth,
        minHeight,
        resizable: resizable ?? true,
        icon: getAppIconPath(),
        autoHideMenuBar: true,
        backgroundColor: windowBackgroundColor("canvas"),
      });
      if (isDev()) {
        window.loadURL(`http://localhost:5123/#/${route}`);
      } else {
        window.loadFile("dist-react/index.html", { hash: route });
      }
      return window;
    },
  });

  function broadcastUpdateStatus(status: UpdateStatus) {
    updateStatus = status;
    mainWindow.webContents.send("update-status-changed", status);
  }

  setConnectionsMenuHandlers({
    onAddConnection: () => connectionIpc.openAddConnection(),
    onManageConnections: () => connectionIpc.openManager(),
    onImportConnections: () => connectionIpc.openManager(null, "import"),
    onExportConnections: () => {
      void connectionIpc.exportToFile(mainWindow, null).then((result) => {
        if (!result.success && !result.cancelled && result.error) {
          dialog.showErrorBox("Export connections", result.error);
        }
      });
    },
  });

  await connectionIpc.registerRestoredOnPremises();

  const mainWindow = new BrowserWindow(getMainWindowOptions({
    webPreferences: {
      preload: getPreloadPath(),
    },
    width: 800,
    height: 600,
    icon: getAppIconPath(),
    show: false,
  }));
  configureMainWindowChrome(mainWindow);
  mainWindow.maximize();
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (!splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    updateController = configureAutoUpdates({
      isPackaged: app.isPackaged,
      isDevelopment: isDev(),
      updater: autoUpdater,
      sendStatus: broadcastUpdateStatus,
    });
    // Same gate as updates: development runs never count as active installs.
    if (shouldCheckForUpdates({ isPackaged: app.isPackaged, isDevelopment: isDev() })) {
      startUsageStats({
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        fetch: (url, init) => net.fetch(url, init),
      });
    }
  });

  if (isDev()) {
    mainWindow.loadURL("http://localhost:5123");
  } else {
    mainWindow.loadFile("dist-react/index.html");
  }
});
