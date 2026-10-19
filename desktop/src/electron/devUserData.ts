import { app } from "electron";
import { join } from "path";

export const DEV_USER_DATA_FOLDER = "Power Tools Dev";

type ElectronApp = Pick<typeof app, "isPackaged" | "getPath" | "setPath"> & {
  commandLine: Pick<typeof app.commandLine, "hasSwitch">;
};

/**
 * Gives unpackaged dev runs their own userData folder, so connections, the
 * MSAL cache and settings never rewrite the installed app's data. An explicit
 * --user-data-dir, such as the smoke test's isolated profile, wins.
 */
export function applyDevUserData(electronApp: ElectronApp = app) {
  if (electronApp.isPackaged) return;
  if (electronApp.commandLine.hasSwitch("user-data-dir")) return;
  electronApp.setPath("userData", join(electronApp.getPath("appData"), DEV_USER_DATA_FOLDER));
}

applyDevUserData();
