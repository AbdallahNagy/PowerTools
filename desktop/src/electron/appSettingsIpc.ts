// IPC for the Settings dialog's app preferences: theme, privacy switches, and opening fixed folders.
// Only the main window may ask. Nothing here takes a path from the renderer.
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import { isThemePreference, type ThemePreference } from "./theme.js";

export const SETTINGS_FOLDERS = ["data", "mcp-activity"] as const;
export type SettingsFolder = (typeof SETTINGS_FOLDERS)[number];

export interface AppSettings {
  theme: ThemePreference;
  usageStats: boolean;
  crashReports: boolean;
  version: string;
  /** False in development and unpackaged builds, where the updater does nothing. */
  updatesEnabled: boolean;
}

export interface AppSettingsIpcDeps {
  ipcMain: Pick<IpcMain, "handle">;
  getMainWindow: () => BrowserWindow | null;
  version: string;
  updatesEnabled: boolean;
  theme: { load(): ThemePreference; apply(theme: ThemePreference): void; save(theme: ThemePreference): void };
  usageStats: { load(): boolean; save(enabled: boolean): void };
  crashReports: { load(): boolean; save(enabled: boolean): void };
  /** Rebuilds the application menu so its checkmarks match the saved preferences. */
  refreshMenu(): void;
  folderPath(folder: SettingsFolder): string;
  /** Resolves to an error message, or an empty string on success (Electron's shell.openPath). */
  openPath(path: string): Promise<string>;
}

export function registerAppSettingsIpc(deps: AppSettingsIpcDeps) {
  const { ipcMain } = deps;

  function assertMainWindow(event: IpcMainInvokeEvent): void {
    const window = deps.getMainWindow();
    if (!window || event.sender !== window.webContents) {
      throw new Error("Settings are only available from the main window");
    }
  }

  const read = (): AppSettings => ({
    theme: deps.theme.load(),
    usageStats: deps.usageStats.load(),
    crashReports: deps.crashReports.load(),
    version: deps.version,
    updatesEnabled: deps.updatesEnabled,
  });

  ipcMain.handle("app-settings-get", async (event) => {
    assertMainWindow(event);
    return read();
  });

  ipcMain.handle("app-settings-set-theme", async (event, theme: unknown) => {
    assertMainWindow(event);
    if (!isThemePreference(theme)) throw new Error("Theme must be system, dark, or light");
    deps.theme.apply(theme);
    deps.theme.save(theme);
    deps.refreshMenu();
    return read();
  });

  ipcMain.handle("app-settings-set-usage-stats", async (event, enabled: unknown) => {
    assertMainWindow(event);
    if (typeof enabled !== "boolean") throw new Error("Enabled must be true or false");
    deps.usageStats.save(enabled);
    deps.refreshMenu();
    return read();
  });

  ipcMain.handle("app-settings-set-crash-reports", async (event, enabled: unknown) => {
    assertMainWindow(event);
    if (typeof enabled !== "boolean") throw new Error("Enabled must be true or false");
    deps.crashReports.save(enabled);
    deps.refreshMenu();
    return read();
  });

  ipcMain.handle("app-settings-open-folder", async (event, folder: unknown) => {
    assertMainWindow(event);
    if (typeof folder !== "string" || !(SETTINGS_FOLDERS as readonly string[]).includes(folder)) {
      throw new Error("Folder must be one of: " + SETTINGS_FOLDERS.join(", "));
    }
    const failure = await deps.openPath(deps.folderPath(folder as SettingsFolder));
    if (failure) throw new Error(failure);
  });
}
