import { beforeEach, describe, expect, it, vi } from "vitest";

const { handlers, menuState } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  menuState: {
    items: [] as Array<{
      label?: string;
      role?: string;
      submenu?: { popup: ReturnType<typeof vi.fn> };
    }>,
  },
}));

vi.mock("electron", () => {
  class BrowserWindow {
    static fromWebContents(contents: { window?: FakeWindow | null }) {
      return contents.window ?? null;
    }

    webContents = { send: vi.fn() };
    isDestroyed() {
      return false;
    }
    isMaximized() {
      return false;
    }
    minimize = vi.fn();
    maximize = vi.fn();
    unmaximize = vi.fn();
    close = vi.fn();
    setMenuBarVisibility = vi.fn();
    setAutoHideMenuBar = vi.fn();
    on = vi.fn();
  }

  return {
    BrowserWindow,
    Menu: {
      setApplicationMenu: vi.fn(),
      getApplicationMenu: vi.fn(() => ({ items: menuState.items })),
      buildFromTemplate: vi.fn((template: unknown) => ({ items: template })),
    },
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      },
    },
  };
});

type FakeWindow = {
  isDestroyed: () => boolean;
  isMaximized: () => boolean;
  minimize: ReturnType<typeof vi.fn>;
  maximize: ReturnType<typeof vi.fn>;
  unmaximize: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  webContents: { send: ReturnType<typeof vi.fn> };
};

function createWindow(overrides: Partial<FakeWindow> = {}): FakeWindow {
  return {
    isDestroyed: () => false,
    isMaximized: () => false,
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    close: vi.fn(),
    webContents: { send: vi.fn() },
    ...overrides,
  };
}

describe("window chrome", () => {
  beforeEach(() => {
    handlers.clear();
    menuState.items = [];
    vi.resetModules();
  });

  it("creates a frameless main window without a native menu row", async () => {
    const { getMainWindowOptions } = await import("../../src/electron/windowChrome.ts");

    expect(
      getMainWindowOptions({
        width: 800,
        height: 600,
        show: false,
      }),
    ).toMatchObject({
      width: 800,
      height: 600,
      show: false,
      frame: false,
      autoHideMenuBar: true,
      backgroundColor: "#252526",
    });
  });

  it("matches File, Edit, View, and Help by label or role", async () => {
    const { findApplicationSubmenu, parseTitleBarMenuId } = await import(
      "../../src/electron/windowChrome.ts"
    );
    const file = { label: "&File", submenu: { popup: vi.fn() } };
    const edit = { role: "editMenu", submenu: { popup: vi.fn() } };
    const view = { role: "viewMenu", submenu: { popup: vi.fn() } };
    const help = { role: "help", submenu: { popup: vi.fn() } };

    expect(parseTitleBarMenuId("File")).toBe("file");
    expect(findApplicationSubmenu([file, edit, view, help], "file")).toBe(file.submenu);
    expect(findApplicationSubmenu([file, edit, view, help], "edit")).toBe(edit.submenu);
    expect(findApplicationSubmenu([file, edit, view, help], "view")).toBe(view.submenu);
    expect(findApplicationSubmenu([file, edit, view, help], "help")).toBe(help.submenu);
    expect(parseTitleBarMenuId("window")).toBeUndefined();
  });

  it("pops the native submenu at the title-bar button and ignores invalid menus", async () => {
    const filePopup = vi.fn();
    menuState.items = [{ label: "File", submenu: { popup: filePopup } }];
    const { registerWindowChromeIpc } = await import("../../src/electron/windowChrome.ts");
    const { ipcMain } = await import("electron");
    registerWindowChromeIpc(ipcMain);

    const window = createWindow();
    const event = { sender: { window } };

    await handlers.get("popup-app-menu")?.(event, "file", 12.4, 31.8);
    await handlers.get("popup-app-menu")?.(event, "window", 0, 0);
    await handlers.get("popup-app-menu")?.(event, "file", Number.NaN, 10);

    expect(filePopup).toHaveBeenCalledWith({ window, x: 12, y: 32 });
    expect(filePopup).toHaveBeenCalledTimes(1);
  });

  it("toggles maximize on the sender window", async () => {
    const { registerWindowChromeIpc } = await import("../../src/electron/windowChrome.ts");
    const { ipcMain } = await import("electron");
    registerWindowChromeIpc(ipcMain);

    const restored = createWindow({ isMaximized: () => false });
    const maximized = createWindow({ isMaximized: () => true });

    await handlers.get("window-toggle-maximize")?.({ sender: { window: restored } });
    await handlers.get("window-toggle-maximize")?.({ sender: { window: maximized } });
    await handlers.get("window-minimize")?.({ sender: { window: restored } });
    await handlers.get("window-close")?.({ sender: { window: restored } });

    expect(restored.maximize).toHaveBeenCalledTimes(1);
    expect(maximized.unmaximize).toHaveBeenCalledTimes(1);
    expect(restored.minimize).toHaveBeenCalledTimes(1);
    expect(restored.close).toHaveBeenCalledTimes(1);
    expect(await handlers.get("window-is-maximized")?.({ sender: { window: maximized } })).toBe(true);
  });

  it("hides the native menu bar on the main window", async () => {
    const { configureMainWindowChrome } = await import("../../src/electron/windowChrome.ts");
    const { BrowserWindow } = await import("electron");
    const window = new BrowserWindow();

    configureMainWindowChrome(window as never);

    expect(window.setMenuBarVisibility).toHaveBeenCalledWith(false);
    expect(window.setAutoHideMenuBar).toHaveBeenCalledWith(true);
    expect(window.on).toHaveBeenCalledWith("maximize", expect.any(Function));
    expect(window.on).toHaveBeenCalledWith("unmaximize", expect.any(Function));
  });
});
