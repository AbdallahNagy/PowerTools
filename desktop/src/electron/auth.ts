import { PublicClientApplication, LogLevel } from "@azure/msal-node";
import { shell } from "electron";

/**
 * Acquires a Dataverse access token via interactive browser login.
 * Opens the system browser for the user to authenticate with Azure AD,
 * then captures the token via a loopback redirect on http://localhost.
 */
export async function acquireTokenInteractive(
  envUrl: string,
  clientId: string
): Promise<string> {
  const normalizedUrl = envUrl.replace(/\/$/, "");

  const pca = new PublicClientApplication({
    auth: {
      clientId,
      // "common" accepts tokens from any AAD tenant (multi-tenant)
      authority: "https://login.microsoftonline.com/common",
    },
    system: {
      loggerOptions: {
        logLevel: LogLevel.Warning,
        piiLoggingEnabled: false,
      },
    },
  });

  const result = await pca.acquireTokenInteractive({
    scopes: [`${normalizedUrl}/.default`],
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

  if (!result?.accessToken) {
    throw new Error("No access token received.");
  }

  return result.accessToken;
}
