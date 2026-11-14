import { describe, expect, it, vi } from "vitest";
import { registerAppSettingsIpc } from "../../src/electron/appSettingsIpc";

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>;

function setup(openPathResult = "") {
  const handlers = new Map<string, Handler>();
  const mainContents = { id: 1 };
  let theme: "system" | "dark" | "light" = "system";
  let usageStats = true;
  let crashReports = true;
  const deps = {
    apply: vi.fn(),
    refreshMenu: vi.fn(),
    openPath: vi.fn(async () => openPathResult),
    folderPath: vi.fn((folder: string) => `/user-data/${folder}`),
  };
  registerAppSettingsIpc({
    ipcMain: { handle: (channel: string, handler: Handler) => void handlers.set(channel, handler) } as never,
    getMainWindow: () => ({ webContents: mainContents }) as never,
    version: "1.3.0",
    updatesEnabled: true,
    theme: { load: () => theme, apply: deps.apply, save: (next) => (theme = next) },
    usageStats: { load: () => usageStats, save: (next) => (usageStats = next) },
    crashReports: { load: () => crashReports, save: (next) => (crashReports = next) },
    refreshMenu: deps.refreshMenu,
    folderPath: deps.folderPath,
    openPath: deps.openPath,
  });
  const call = (channel: string, sender: unknown, ...args: unknown[]) => handlers.get(channel)!({ sender }, ...args);
  return { call, mainContents, deps, handlers };
}

describe("app settings IPC", () => {
  it("reads the saved preferences and the version", async () => {
    const { call, mainContents } = setup();
    expect(await call("app-settings-get", mainContents)).toEqual({
      theme: "system",
      usageStats: true,
      crashReports: true,
      version: "1.3.0",
      updatesEnabled: true,
    });
  });

  it("rejects a foreign sender on every channel", async () => {
    const { call, handlers } = setup();
    for (const channel of handlers.keys()) {
      await expect(call(channel, { id: 2 }, "dark")).rejects.toThrow(/main window/);
    }
  });

  it("applies and saves a theme, then rebuilds the menu", async () => {
    const { call, mainContents, deps } = setup();
    expect(await call("app-settings-set-theme", mainContents, "dark")).toMatchObject({ theme: "dark" });
    expect(deps.apply).toHaveBeenCalledWith("dark");
    expect(deps.refreshMenu).toHaveBeenCalledOnce();
  });

  it("refuses an unknown theme without changing anything", async () => {
    const { call, mainContents, deps } = setup();
    await expect(call("app-settings-set-theme", mainContents, "neon")).rejects.toThrow(/system, dark, or light/);
    expect(deps.apply).not.toHaveBeenCalled();
    expect(deps.refreshMenu).not.toHaveBeenCalled();
  });

  it("switches usage stats and crash reports and validates the value", async () => {
    const { call, mainContents, deps } = setup();
    expect(await call("app-settings-set-usage-stats", mainContents, false)).toMatchObject({ usageStats: false });
    expect(await call("app-settings-set-crash-reports", mainContents, false)).toMatchObject({ crashReports: false });
    expect(deps.refreshMenu).toHaveBeenCalledTimes(2);
    await expect(call("app-settings-set-usage-stats", mainContents, "no")).rejects.toThrow(/true or false/);
    await expect(call("app-settings-set-crash-reports", mainContents, 1)).rejects.toThrow(/true or false/);
  });

  it("opens only the known folders", async () => {
    const { call, mainContents, deps } = setup();
    await call("app-settings-open-folder", mainContents, "data");
    await call("app-settings-open-folder", mainContents, "mcp-activity");
    expect(deps.openPath.mock.calls).toEqual([["/user-data/data"], ["/user-data/mcp-activity"]]);
    await expect(call("app-settings-open-folder", mainContents, "C:\\Windows")).rejects.toThrow(/Folder must be one of/);
    expect(deps.openPath).toHaveBeenCalledTimes(2);
  });

  it("reports a folder that could not be opened", async () => {
    const { call, mainContents } = setup("No application is associated");
    await expect(call("app-settings-open-folder", mainContents, "data")).rejects.toThrow(/No application/);
  });
});
