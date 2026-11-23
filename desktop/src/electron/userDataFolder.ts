import { app } from "electron";
import { existsSync } from "fs";
import { join } from "path";

/**
 * Folder names under %APPDATA% (and %LOCALAPPDATA% for the MCP connector). Installs from before the rename to Dyno
 * keep their "Power Tools" folders, so connections, the encrypted MSAL cache and settings stay where they are.
 * The MCP connector picks its discovery file by the same rule; see McpDiscovery.DefaultPath in api/Dyno.
 */
export const USER_DATA_FOLDER = "Dyno";
export const LEGACY_USER_DATA_FOLDER = "Power Tools";
export const DEV_USER_DATA_FOLDER = "Dyno Dev";
export const LEGACY_DEV_USER_DATA_FOLDER = "Power Tools Dev";

type ElectronApp = Pick<typeof app, "isPackaged" | "getPath" | "setPath"> & {
  commandLine: Pick<typeof app.commandLine, "hasSwitch">;
};

type Exists = (path: string) => boolean;

/** The new folder, unless only the folder from before the rename exists. */
export function chooseFolder(appData: string, current: string, legacy: string, exists: Exists = existsSync): string {
  return !exists(join(appData, current)) && exists(join(appData, legacy)) ? legacy : current;
}

/** The app's folder name: "Dyno", "Dyno Dev" for unpackaged dev runs, or the "Power Tools" folder an older install made. */
export function appFolderName(electronApp: ElectronApp = app, exists: Exists = existsSync): string {
  const [current, legacy] = electronApp.isPackaged
    ? [USER_DATA_FOLDER, LEGACY_USER_DATA_FOLDER]
    : [DEV_USER_DATA_FOLDER, LEGACY_DEV_USER_DATA_FOLDER];
  return chooseFolder(electronApp.getPath("appData"), current, legacy, exists);
}

/**
 * Points userData at the app's folder. Unpackaged dev runs get their own folder, so connections, the MSAL cache and
 * settings never rewrite the installed app's data. An explicit --user-data-dir, such as the smoke test's isolated
 * profile, wins.
 */
export function applyUserDataFolder(electronApp: ElectronApp = app, exists: Exists = existsSync) {
  if (electronApp.commandLine.hasSwitch("user-data-dir")) return;
  electronApp.setPath("userData", join(electronApp.getPath("appData"), appFolderName(electronApp, exists)));
}

applyUserDataFolder();
