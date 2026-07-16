import {
  PublicClientApplication,
  LogLevel,
  AccountInfo,
  ICachePlugin,
  TokenCacheContext,
} from "@azure/msal-node";
import { app, BrowserWindow, safeStorage } from "electron";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { AZURE_CLIENT_ID } from "./config.js";

let pca: PublicClientApplication | null = null;
let interactiveAuthWindow: BrowserWindow | null = null;

function cacheFilePath(): string {
  return join(app.getPath("userData"), "msal-cache.bin");
}

// Persists the MSAL token cache to disk, encrypted with the OS keychain
// (DPAPI on Windows) when available, plaintext otherwise (dev fallback).
const cachePlugin: ICachePlugin = {
  async beforeCacheAccess(ctx: TokenCacheContext) {
    const path = cacheFilePath();
    if (!existsSync(path)) return;
    try {
      const buf = readFileSync(path);
      let data: string;
      if (safeStorage.isEncryptionAvailable()) {
        data = safeStorage.decryptString(buf);
      } else {
        data = buf.toString("utf-8");
      }
      ctx.tokenCache.deserialize(data);
    } catch (err) {
      console.error("Failed to load MSAL cache:", err);
    }
  },
  async afterCacheAccess(ctx: TokenCacheContext) {
    if (!ctx.cacheHasChanged) return;
    try {
      const data = ctx.tokenCache.serialize();
      const buf = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(data)
        : Buffer.from(data, "utf-8");
      writeFileSync(cacheFilePath(), buf);
    } catch (err) {
      console.error("Failed to persist MSAL cache:", err);
    }
  },
};

function getPca(): PublicClientApplication {
  if (pca) return pca;
  pca = new PublicClientApplication({
    auth: {
      clientId: AZURE_CLIENT_ID,
      authority: "https://login.microsoftonline.com/common",
    },
    cache: {
      cachePlugin,
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

/** Restore a previously persisted account from the token cache. */
export async function getAccountByHomeId(
  homeAccountId: string
): Promise<AccountInfo | null> {
  return getPca().getTokenCache().getAccountByHomeId(homeAccountId);
}

/** Purge an account (and its refresh token) from the token cache. */
export async function removeAccount(account: AccountInfo): Promise<void> {
  await getPca().getTokenCache().removeAccount(account);
}

function scopesFor(envUrl: string): string[] {
  return [`${envUrl.replace(/\/$/, "")}/.default`];
}

async function openAuthBrowserWindow(url: string): Promise<void> {
  if (interactiveAuthWindow && !interactiveAuthWindow.isDestroyed()) {
    interactiveAuthWindow.close();
  }

  interactiveAuthWindow = new BrowserWindow({
    width: 980,
    height: 720,
    title: "PowerTools sign in",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  interactiveAuthWindow.on("closed", () => {
    interactiveAuthWindow = null;
  });

  await interactiveAuthWindow.loadURL(url);
  interactiveAuthWindow.show();
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
    openBrowser: openAuthBrowserWindow,
    successTemplate: `
      <html><body style="font-family:sans-serif;padding:40px;text-align:center;background:#1e1e1e;color:#cccccc">
        <h2 style="color:#4ec9b0">&#10003; Microsoft sign-in complete</h2>
        <p>PowerTools is validating access to Dataverse. You can close this tab and return to PowerTools.</p>
      </body></html>`,
    errorTemplate: `
      <html><body style="font-family:sans-serif;padding:40px;text-align:center;background:#1e1e1e;color:#cccccc">
        <h2 style="color:#f48771">&#10007; Authentication failed</h2>
        <p>{errorMessage}</p>
      </body></html>`,
  });

  if (!result?.accessToken) throw new Error("No access token received.");
  if (interactiveAuthWindow && !interactiveAuthWindow.isDestroyed()) {
    setTimeout(() => interactiveAuthWindow?.close(), 1200);
  }
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
