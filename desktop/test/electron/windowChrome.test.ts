import { beforeEach, describe, expect, it, vi } from "vitest";

const { handlers, menuState, themeState } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  themeState: { shouldUseDarkColors: true, themeSource: "system", on: () => {} },
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
    app: { getPath: () => "/nonexistent-user-data" },
    nativeTheme: themeState,
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
    themeState.shouldUseDarkColors = true;
    themeState.themeSource = "system";
    vi.resetModules();
  });

  it.each(["win32", "linux"] as const)(
    "creates a frameless main window without a native menu row on %s",
    async (platform) => {
      const { getMainWindowOptions } = await import("../../src/electron/windowChrome.ts");

      const options = getMainWindowOptions({ width: 800, height: 600, show: false }, platform);
      expect(options).toMatchObject({
        width: 800,
        height: 600,
        show: false,
        frame: false,
        autoHideMenuBar: true,
        backgroundColor: "#1b1f26",
      });
      expect(options.titleBarStyle).toBeUndefined();
    },
  );

  it("keeps the native traffic lights over the title bar on macOS", async () => {
    const { getMainWindowOptions, MAC_TRAFFIC_LIGHT_POSITION } = await import(
      "../../src/electron/windowChrome.ts"
    );

    const options = getMainWindowOptions({ width: 800 }, "darwin");
    expect(options).toMatchObject({
      width: 800,
      titleBarStyle: "hidden",
      trafficLightPosition: MAC_TRAFFIC_LIGHT_POSITION,
      backgroundColor: "#1b1f26",
    });
    expect(options.frame).toBeUndefined();
  });

  it("paints the main window with the light surface in the light theme", async () => {
    themeState.shouldUseDarkColors = false;
    const { getMainWindowOptions } = await import("../../src/electron/windowChrome.ts");

    expect(getMainWindowOptions({}).backgroundColor).toBe("#ffffff");
  });

  it("offers System, Dark, and Light under View > Theme", async () => {
    const { createApplicationMenuTemplate } = await import("../../src/electron/windowChrome.ts");
    const onThemeChange = vi.fn();
    const template = createApplicationMenuTemplate({ theme: "light", onThemeChange });
    const view = template.find((item) => item.label === "View");
    const viewItems = view?.submenu as Electron.MenuItemConstructorOptions[];
    const theme = viewItems.find((item) => item.label === "Theme");
    const choices = theme?.submenu as Electron.MenuItemConstructorOptions[];

    expect(choices.map((item) => [item.label, item.type, item.checked])).toEqual([
      ["System", "radio", false],
      ["Dark", "radio", false],
      ["Light", "radio", true],
    ]);
    expect(viewItems.some((item) => item.role === "toggleDevTools")).toBe(true);

    (choices[1].click as () => void)();
    expect(onThemeChange).toHaveBeenCalledWith("dark");
  });

  it("puts the usage stats opt-out in the Help menu", async () => {
    const { createApplicationMenuTemplate } = await import("../../src/electron/windowChrome.ts");
    const onChange = vi.fn();
    const template = createApplicationMenuTemplate(undefined, { enabled: false, onChange });
    const help = template.find((item) => item.label === "Help");
    const [usageStats] = help?.submenu as Electron.MenuItemConstructorOptions[];

    expect(help?.role).toBe("help");
    expect(usageStats).toMatchObject({
      label: "Send Anonymous Usage Stats",
      type: "checkbox",
      checked: false,
    });
    (usageStats.click as (menuItem: { checked: boolean }) => void)({ checked: true });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("puts the crash reports opt-out in the Help menu", async () => {
    const { createApplicationMenuTemplate } = await import("../../src/electron/windowChrome.ts");
    const onChange = vi.fn();
    const template = createApplicationMenuTemplate(undefined, undefined, { enabled: false, onChange });
    const help = template.find((item) => item.label === "Help");
    const [, crashReports] = help?.submenu as Electron.MenuItemConstructorOptions[];

    expect(crashReports).toMatchObject({
      label: "Send Crash Reports",
      type: "checkbox",
      checked: false,
    });
    (crashReports.click as (menuItem: { checked: boolean }) => void)({ checked: true });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("puts Request a Tool in the Help menu", async () => {
    const { createApplicationMenuTemplate } = await import("../../src/electron/windowChrome.ts");
    const onRequestTool = vi.fn();
    const template = createApplicationMenuTemplate(undefined, undefined, undefined, { onRequestTool });
    const help = template.find((item) => item.label === "Help");
    const helpItems = help?.submenu as Electron.MenuItemConstructorOptions[];
    const requestTool = helpItems[helpItems.length - 1];

    expect(requestTool?.label).toBe("Request a Tool…");
    (requestTool?.click as () => void)();
    expect(onRequestTool).toHaveBeenCalledOnce();
  });

  it("puts connection commands in the File menu", async () => {
    const { createApplicationMenuTemplate } = await import("../../src/electron/windowChrome.ts");
    const handlers = {
      onAddConnection: vi.fn(),
      onManageConnections: vi.fn(),
      onImportConnections: vi.fn(),
      onExportConnections: vi.fn(),
    };
    const template = createApplicationMenuTemplate(undefined, undefined, undefined, undefined, handlers, "win32");
    const file = template.find((item) => item.label === "File");
    const items = file?.submenu as Electron.MenuItemConstructorOptions[];

    expect(items.map((item) => item.label ?? item.role ?? item.type)).toEqual([
      "Add Connection…",
      "Manage Connections…",
      "separator",
      "Import Connections…",
      "Export Connections…",
      "separator",
      "quit",
    ]);
    for (const item of items.filter((entry) => entry.click)) {
      (item.click as () => void)();
    }
    expect(Object.values(handlers).every((handler) => handler.mock.calls.length === 1)).toBe(true);
  });

  it("adds the macOS app menu and keeps Cmd+W out of the File menu", async () => {
    const { createApplicationMenuTemplate, findApplicationSubmenu } = await import(
      "../../src/electron/windowChrome.ts"
    );
    const template = createApplicationMenuTemplate(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "darwin",
    );
    const file = template.find((item) => item.label === "File");
    const fileItems = file?.submenu as Electron.MenuItemConstructorOptions[];

    expect(template[0]).toEqual({ role: "appMenu" });
    expect(fileItems.map((item) => item.label ?? item.role ?? item.type)).toEqual([
      "Add Connection…",
      "Manage Connections…",
      "separator",
      "Import Connections…",
      "Export Connections…",
    ]);
    expect(template.find((item) => item.label === "Window")?.submenu).toEqual([
      { role: "minimize" },
      { role: "close", accelerator: "" },
    ]);
    const items = template.map((item) => ({
      label: item.label,
      role: item.role,
      submenu: { popup: vi.fn(), id: item.label ?? item.role },
    }));
    expect(findApplicationSubmenu(items, "file")).toMatchObject({ id: "File" });
  });

  it("leaves Ctrl+W free so the shell can close the active tab", async () => {
    const { createApplicationMenuTemplate } = await import("../../src/electron/windowChrome.ts");
    const template = createApplicationMenuTemplate();
    const windowMenu = template.find((item) => item.label === "Window");

    expect(windowMenu).toMatchObject({
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close", accelerator: "" },
      ],
    });
    expect(template.some((item) => item.role === "windowMenu")).toBe(false);
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
