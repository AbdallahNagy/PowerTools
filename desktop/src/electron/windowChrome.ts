import {
  app,
  BrowserWindow,
  Menu,
  shell,
  type IpcMain,
  type IpcMainInvokeEvent,
} from "electron";
import {
  applyThemePreference,
  createThemeMenuItems,
  saveThemePreference,
  windowBackgroundColor,
  type ThemePreference,
} from "./theme.js";
import {
  createUsageStatsMenuItem,
  loadUsageStatsEnabled,
  saveUsageStatsEnabled,
} from "./usageStats.js";
import {
  createCrashReportsMenuItem,
  loadCrashReportsEnabled,
  saveCrashReportsEnabled,
} from "./crashReports.js";
import { toolRequestUrl } from "./toolRequest.js";

export const TITLE_BAR_MENU_IDS = ["file", "edit", "view", "help"] as const;
export type TitleBarMenuId = (typeof TITLE_BAR_MENU_IDS)[number];

export interface ApplicationMenuItemLike {
  label?: string;
  role?: string;
  submenu?: { popup: (options: { window: BrowserWindow; x: number; y: number }) => void };
}

export function isTitleBarMenuId(value: unknown): value is TitleBarMenuId {
  return (
    typeof value === "string" &&
    (TITLE_BAR_MENU_IDS as readonly string[]).includes(value.toLowerCase())
  );
}

export function parseTitleBarMenuId(value: unknown): TitleBarMenuId | undefined {
  if (!isTitleBarMenuId(value)) {
    return undefined;
  }
  return value.toLowerCase() as TitleBarMenuId;
}

export function normalizeMenuIdentity(label?: string, role?: string): string {
  const fromLabel = (label ?? "").replace(/&/g, "").trim().toLowerCase();
  if (fromLabel) {
    return fromLabel;
  }
  return (role ?? "").replace(/menu$/i, "").trim().toLowerCase();
}

export function findApplicationSubmenu(
  items: readonly ApplicationMenuItemLike[],
  menuId: TitleBarMenuId,
): ApplicationMenuItemLike["submenu"] | undefined {
  const item = items.find((entry) => {
    const identity = normalizeMenuIdentity(entry.label, entry.role);
    const role = (entry.role ?? "").toLowerCase();
    return identity === menuId || role === menuId || role === `${menuId}menu`;
  });
  return item?.submenu;
}

export function getMainWindowOptions(
  options: Electron.BrowserWindowConstructorOptions,
): Electron.BrowserWindowConstructorOptions {
  return {
    ...options,
    frame: false,
    autoHideMenuBar: true,
    // Matches --color-surface (theme.css) so the frameless chrome has no flash.
    backgroundColor: windowBackgroundColor(),
  };
}

export interface ThemeMenuOptions {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

const DEFAULT_THEME_MENU: ThemeMenuOptions = {
  theme: "system",
  onThemeChange: (theme) => {
    applyThemePreference(theme);
    saveThemePreference(theme);
  },
};

export interface UsageStatsMenuOptions {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export type CrashReportsMenuOptions = UsageStatsMenuOptions;

const DEFAULT_CRASH_REPORTS_MENU: CrashReportsMenuOptions = {
  enabled: true,
  onChange: saveCrashReportsEnabled,
};

export interface ToolRequestMenuOptions {
  onRequestTool: () => void;
}

const DEFAULT_TOOL_REQUEST_MENU: ToolRequestMenuOptions = {
  onRequestTool: () => {
    void shell.openExternal(toolRequestUrl(app.getVersion()));
  },
};

export interface ConnectionsMenuOptions {
  onAddConnection: () => void;
  onManageConnections: () => void;
  onImportConnections: () => void;
  onExportConnections: () => void;
}

// The menu is built before connections load, so the items call whatever main sets later.
let connectionsMenuHandlers: ConnectionsMenuOptions = {
  onAddConnection: () => undefined,
  onManageConnections: () => undefined,
  onImportConnections: () => undefined,
  onExportConnections: () => undefined,
};

export function setConnectionsMenuHandlers(handlers: ConnectionsMenuOptions): void {
  connectionsMenuHandlers = handlers;
}

const DEFAULT_CONNECTIONS_MENU: ConnectionsMenuOptions = {
  onAddConnection: () => connectionsMenuHandlers.onAddConnection(),
  onManageConnections: () => connectionsMenuHandlers.onManageConnections(),
  onImportConnections: () => connectionsMenuHandlers.onImportConnections(),
  onExportConnections: () => connectionsMenuHandlers.onExportConnections(),
};

const DEFAULT_USAGE_STATS_MENU: UsageStatsMenuOptions = {
  enabled: true,
  onChange: saveUsageStatsEnabled,
};

export function createApplicationMenuTemplate(
  themeMenu: ThemeMenuOptions = DEFAULT_THEME_MENU,
  usageStatsMenu: UsageStatsMenuOptions = DEFAULT_USAGE_STATS_MENU,
  crashReportsMenu: CrashReportsMenuOptions = DEFAULT_CRASH_REPORTS_MENU,
  toolRequestMenu: ToolRequestMenuOptions = DEFAULT_TOOL_REQUEST_MENU,
  connectionsMenu: ConnectionsMenuOptions = DEFAULT_CONNECTIONS_MENU,
): Electron.MenuItemConstructorOptions[] {
  return [
    {
      label: "File",
      submenu: [
        { label: "Add Connection…", click: () => connectionsMenu.onAddConnection() },
        { label: "Manage Connections…", click: () => connectionsMenu.onManageConnections() },
        { type: "separator" },
        { label: "Import Connections…", click: () => connectionsMenu.onImportConnections() },
        { label: "Export Connections…", click: () => connectionsMenu.onExportConnections() },
        { type: "separator" },
        // The rest matches Electron's default fileMenu role.
        process.platform === "darwin" ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Theme", submenu: createThemeMenuItems(themeMenu.theme, themeMenu.onThemeChange) },
        { type: "separator" },
        // The rest matches Electron's default viewMenu role.
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        // The Close role defaults to CmdOrCtrl+W. An empty accelerator keeps
        // that shortcut for closing the active tab. Alt+F4 still closes the window.
        { role: "close", accelerator: "" },
      ],
    },
    {
      label: "Help",
      role: "help",
      submenu: [
        createUsageStatsMenuItem(usageStatsMenu.enabled, usageStatsMenu.onChange),
        createCrashReportsMenuItem(crashReportsMenu.enabled, crashReportsMenu.onChange),
        { type: "separator" },
        { label: "Request a Tool…", click: () => toolRequestMenu.onRequestTool() },
      ],
    },
  ];
}

export function installApplicationMenu(theme: ThemePreference = "system"): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      createApplicationMenuTemplate(
        { ...DEFAULT_THEME_MENU, theme },
        { ...DEFAULT_USAGE_STATS_MENU, enabled: loadUsageStatsEnabled() },
        { ...DEFAULT_CRASH_REPORTS_MENU, enabled: loadCrashReportsEnabled() },
      ),
    ),
  );
}

function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) {
    return null;
  }
  return window;
}

export function registerWindowChromeIpc(ipcMain: IpcMain, theme: ThemePreference = "system"): void {
  installApplicationMenu(theme);

  ipcMain.handle("popup-app-menu", (event, menuId: unknown, x: unknown, y: unknown) => {
    const parsedMenuId = parseTitleBarMenuId(menuId);
    if (!parsedMenuId) {
      return;
    }
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    const window = senderWindow(event);
    if (!window) {
      return;
    }

    const submenu = findApplicationSubmenu(Menu.getApplicationMenu()?.items ?? [], parsedMenuId);
    submenu?.popup({
      window,
      x: Math.round(x),
      y: Math.round(y),
    });
  });

  ipcMain.handle("window-minimize", (event) => {
    senderWindow(event)?.minimize();
  });

  ipcMain.handle("window-toggle-maximize", (event) => {
    const window = senderWindow(event);
    if (!window) {
      return;
    }
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });

  ipcMain.handle("window-close", (event) => {
    senderWindow(event)?.close();
  });

  ipcMain.handle("window-is-maximized", (event) => {
    return senderWindow(event)?.isMaximized() ?? false;
  });
}

export function configureMainWindowChrome(window: BrowserWindow): void {
  window.setMenuBarVisibility(false);
  window.setAutoHideMenuBar(true);

  const sendMaximized = (maximized: boolean) => {
    if (!window.isDestroyed()) {
      window.webContents.send("window-maximized-changed", maximized);
    }
  };

  window.on("maximize", () => sendMaximized(true));
  window.on("unmaximize", () => sendMaximized(false));
}
