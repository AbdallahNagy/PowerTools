import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    userData: "",
    nativeTheme: {
      shouldUseDarkColors: true,
      themeSource: "system",
      listeners: [] as Array<() => void>,
      on(_event: string, listener: () => void) {
        this.listeners.push(listener);
      },
    },
    windows: [] as Array<{
      isDestroyed: () => boolean;
      setBackgroundColor: ReturnType<typeof vi.fn>;
      webContents?: { send: ReturnType<typeof vi.fn> };
    }>,
  },
}));

vi.mock("electron", () => ({
  app: { getPath: () => state.userData },
  nativeTheme: state.nativeTheme,
  BrowserWindow: { getAllWindows: () => state.windows },
}));

describe("theme preference", () => {
  beforeEach(() => {
    state.userData = mkdtempSync(join(tmpdir(), "pt-theme-"));
    state.nativeTheme.shouldUseDarkColors = true;
    state.nativeTheme.themeSource = "system";
    state.nativeTheme.listeners = [];
    state.windows = [];
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(state.userData, { recursive: true, force: true });
  });

  it("defaults to System and ignores unknown saved values", async () => {
    const { loadThemePreference } = await import("../../src/electron/theme.ts");
    expect(loadThemePreference()).toBe("system");

    writeFileSync(join(state.userData, "settings.json"), JSON.stringify({ theme: "purple" }));
    expect(loadThemePreference()).toBe("system");
  });

  it("saves the choice next to other settings and restores it", async () => {
    writeFileSync(join(state.userData, "settings.json"), JSON.stringify({ other: 1 }));
    const { initializeTheme, saveThemePreference } = await import("../../src/electron/theme.ts");

    saveThemePreference("light");
    expect(JSON.parse(readFileSync(join(state.userData, "settings.json"), "utf-8"))).toEqual({
      other: 1,
      theme: "light",
    });

    expect(initializeTheme()).toBe("light");
    expect(state.nativeTheme.themeSource).toBe("light");
  });

  it("repaints open windows when the theme changes", async () => {
    const window = { isDestroyed: () => false, setBackgroundColor: vi.fn() };
    state.windows = [window];
    const { initializeTheme } = await import("../../src/electron/theme.ts");
    initializeTheme();

    state.nativeTheme.shouldUseDarkColors = false;
    state.nativeTheme.listeners.forEach((listener) => listener());

    expect(window.setBackgroundColor).toHaveBeenCalledWith("#ffffff");
  });

  it("runs Dark Orange as a dark native theme with its own window colors", async () => {
    writeFileSync(join(state.userData, "settings.json"), JSON.stringify({ theme: "dark-orange" }));
    const { initializeTheme, themeArgument, windowBackgroundColor } = await import("../../src/electron/theme.ts");

    expect(initializeTheme()).toBe("dark-orange");
    expect(state.nativeTheme.themeSource).toBe("dark");
    expect(windowBackgroundColor()).toBe("#262624");
    expect(windowBackgroundColor("canvas")).toBe("#1f1e1d");
    expect(themeArgument()).toBe("--dyno-theme=dark-orange");
  });

  it("tells every window when switching between Dark and Dark Orange", async () => {
    const window = { isDestroyed: () => false, setBackgroundColor: vi.fn(), webContents: { send: vi.fn() } };
    state.windows = [window];
    const { applyThemePreference } = await import("../../src/electron/theme.ts");

    applyThemePreference("dark");
    window.webContents.send.mockClear();
    window.setBackgroundColor.mockClear();

    applyThemePreference("dark-orange");
    expect(state.nativeTheme.themeSource).toBe("dark");
    expect(window.webContents.send).toHaveBeenCalledWith("theme-preference-changed", "dark-orange");
    expect(window.setBackgroundColor).toHaveBeenCalledWith("#262624");

    applyThemePreference("dark");
    expect(window.webContents.send).toHaveBeenLastCalledWith("theme-preference-changed", "dark");
    expect(window.setBackgroundColor).toHaveBeenLastCalledWith("#1b1f26");
  });
});
