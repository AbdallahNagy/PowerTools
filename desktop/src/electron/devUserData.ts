import { app } from "electron";
import { join } from "path";

export const DEV_USER_DATA_FOLDER = "Power Tools Dev";

/**
 * Gives unpackaged dev runs their own userData folder, so connections, the
 * MSAL cache and settings never rewrite the installed app's data.
 */
export function applyDevUserData(electronApp: Pick<typeof app, "isPackaged" | "getPath" | "setPath"> = app) {
  if (electronApp.isPackaged) return;
  electronApp.setPath("userData", join(electronApp.getPath("appData"), DEV_USER_DATA_FOLDER));
}

applyDevUserData();
