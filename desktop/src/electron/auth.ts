import {
  PublicClientApplication,
  LogLevel,
  AccountInfo,
} from "@azure/msal-node";
import { shell } from "electron";
import { AZURE_CLIENT_ID } from "./config.js";

let pca: PublicClientApplication | null = null;

function getPca(): PublicClientApplication {
  if (pca) return pca;
  pca = new PublicClientApplication({
    auth: {
      clientId: AZURE_CLIENT_ID,
      authority: "https://login.microsoftonline.com/common",
    },
    system: {
      loggerOptions: {
        logLevel: LogLevel.Warning,
        piiLoggingEnabled: false,
      },
    },
  });
  return pca;
}

function scopesFor(envUrl: string): string[] {
  return [`${envUrl.replace(/\/$/, "")}/.default`];
}

/**
 * Interactive login via the system browser. Use when no account exists yet
 * (first-time connect) or when silent refresh fails.
 */
export async function acquireTokenInteractive(
  envUrl: string
): Promise<{ accessToken: string; account: AccountInfo | null }> {
  const result = await getPca().acquireTokenInteractive({
    scopes: scopesFor(envUrl),
    openBrowser: (url) => shell.openExternal(url),
    successTemplate: `
      <html><body style="font-family:sans-serif;padding:40px;text-align:center;background:#1e1e1e;color:#cccccc">
        <h2 style="color:#4ec9b0">&#10003; Authentication successful</h2>
        <p>You can close this tab and return to PowerTools.</p>
      </body></html>`,
    errorTemplate: `
      <html><body style="font-family:sans-serif;padding:40px;text-align:center;background:#1e1e1e;color:#cccccc">
        <h2 style="color:#f48771">&#10007; Authentication failed</h2>
        <p>{errorMessage}</p>
      </body></html>`,
  });

  if (!result?.accessToken) throw new Error("No access token received.");
  return { accessToken: result.accessToken, account: result.account };
}

/**
 * Returns a fresh token for the given account, prompting interactively
 * only if the cached refresh token is gone or consent is needed.
 */
export async function acquireTokenSilentOrInteractive(
  envUrl: string,
  account: AccountInfo | null
): Promise<{ accessToken: string; account: AccountInfo | null }> {
  if (account) {
    try {
      const result = await getPca().acquireTokenSilent({
        scopes: scopesFor(envUrl),
        account,
      });
      if (result?.accessToken) {
        return { accessToken: result.accessToken, account: result.account };
      }
    } catch {
      // fall through to interactive
    }
  }
  return acquireTokenInteractive(envUrl);
}
