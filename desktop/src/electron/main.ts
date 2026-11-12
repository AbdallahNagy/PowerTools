// Must load first: Sentry writes into userData, so dev runs switch folders before it starts.
import "./devUserData.js";
// Must load next so Sentry hooks the app before anything else runs.
import "./sentry.js";
import { spawn } from "child_process";
import { rmSync } from "fs";
import { join } from "path";
import { access, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from "fs/promises";
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
  setAgentsMenuHandler,
  setCommunityToolsMenuHandler,
  setConnectionsMenuHandlers,
} from "./windowChrome.js";
import { initializeTheme, windowBackgroundColor } from "./theme.js";
import { startUsageStats } from "./usageStats.js";
import { BUILT_IN_TOOL_IDS } from "./communityTools/builtInToolIds.js";
import { registerCommunityToolIpc } from "./communityTools/toolIpc.js";
import { createToolStore } from "./communityTools/toolStore.js";
import { connectorLaunch } from "./mcp/connectorCommand.js";
import { registerMcpIpc } from "./mcp/mcpIpc.js";
import { createMcpService } from "./mcp/mcpService.js";
import { readSettings, writeSettings } from "./settings.js";
import { installToolProtocol, registerToolScheme } from "./communityTools/toolProtocol.js";

const { autoUpdater } = electronUpdater;

// Privileged schemes must be registered before the app is ready.
registerToolScheme();

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

  const toolStore = createToolStore({
    userDataPath: app.getPath("userData"),
    hostVersion: app.getVersion(),
    builtInToolIds: BUILT_IN_TOOL_IDS,
    fs: {
      readText: (path) => readFile(path, "utf-8"),
      // Write beside the file and rename over it, so a crash mid-write cannot leave a truncated state file.
      writeText: async (path, content) => {
        const temporary = `${path}.${process.pid}.tmp`;
        await writeFile(temporary, content, "utf-8");
        try {
          await rename(temporary, path);
        } catch (error) {
          await rm(temporary, { force: true });
          throw error;
        }
      },
      exists: (path) => access(path).then(() => true, () => false),
      mkdir: async (path) => {
        await mkdir(path, { recursive: true });
      },
      size: async (path) => (await stat(path)).size,
      realpath: (path) => realpath(path),
      remove: (path) => rm(path, { force: true }),
      fileSizes: async (folder) => {
        const sizes: number[] = [];
        const walk = async (directory: string): Promise<void> => {
          for (const entry of await readdir(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) await walk(path);
            else if (entry.isFile()) sizes.push((await stat(path)).size);
          }
        };
        await walk(folder);
        return sizes;
      },
    },
  });
  installToolProtocol({
    isConsented: (id) => toolStore.isConsented(id),
    folderFor: (id) => toolStore.folderFor(id),
    manifestFor: (id) => toolStore.manifestFor(id),
    readFile: (path) => readFile(path),
    realpath: (path) => realpath(path),
    // folderFor and manifestFor are filled by list(); load once so a tool opened at start-up is found.
    ready: toolStore.list(),
  });

  registerCommunityToolIpc({
    ipcMain,
    store: toolStore,
    getMainWindow: () => mainWindow,
    dialogs: {
      chooseFolder: async (window) => {
        const result = await dialog.showOpenDialog(window, {
          title: "Load community tool from folder",
          properties: ["openDirectory"],
        });
        return result.canceled ? null : result.filePaths[0] ?? null;
      },
      chooseOpenFile: async (window, filters) => {
        const result = await dialog.showOpenDialog(window, { properties: ["openFile"], filters });
        return result.canceled ? null : result.filePaths[0] ?? null;
      },
      chooseSaveFile: async (window, suggestedName) => {
        const result = await dialog.showSaveDialog(window, { defaultPath: suggestedName });
        return result.canceled || !result.filePath ? null : result.filePath;
      },
    },
    files: {
      size: async (path) => (await stat(path)).size,
      readText: (path) => readFile(path, "utf-8"),
      writeText: (path, content) => writeFile(path, content, "utf-8"),
    },
  });

  const mcpService = createMcpService({
    userDataPath: app.getPath("userData"),
    sidecar: sidecarHandle,
    connections: connectionIpc,
    appVersion: app.getVersion(),
    readEnabled: () => mcpSettings().enabled === true,
    writeEnabled: (enabled) => writeSettings({ mcp: { ...mcpSettings(), enabled } }),
  });
  function mcpSettings(): { enabled?: boolean } {
    const value = readSettings().mcp;
    return value && typeof value === "object" ? (value as { enabled?: boolean }) : {};
  }
  registerMcpIpc({
    ipcMain,
    service: mcpService,
    getMainWindow: () => mainWindow,
    connector: () =>
      connectorLaunch({
        packaged: !isDev(),
        platform: process.platform,
        resourcesPath: process.resourcesPath,
        appPath: app.getAppPath(),
        discoveryPath: mcpService.status().discoveryPath,
      }),
  });
  app.on("before-quit", () => void mcpService.stop());
  // The quit may not wait for the async stop, so remove the discovery file here as well.
  process.on("exit", () => rmSync(mcpService.status().discoveryPath, { force: true }));
  if (mcpSettings().enabled === true) void mcpService.start();

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

  setCommunityToolsMenuHandler(() => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("open-community-tools");
    }
  });

  setAgentsMenuHandler(() => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("open-agents");
    }
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
