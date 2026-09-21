import {
  BrowserWindow,
  Menu,
  type IpcMain,
  type IpcMainInvokeEvent,
} from "electron";

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
    // Matches --color-bg-darker so the frameless chrome has no white flash.
    backgroundColor: "#252526",
  };
}

export function installApplicationMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "fileMenu" },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
      { role: "help" },
    ]),
  );
}

function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) {
    return null;
  }
  return window;
}

export function registerWindowChromeIpc(ipcMain: IpcMain): void {
  installApplicationMenu();

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
