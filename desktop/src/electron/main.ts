import { app, BrowserWindow, ipcMain } from "electron";
import { AccountInfo } from "@azure/msal-node";
import { isDev } from "./utils.js";
import { getPreloadPath } from "./pathResolver.js";
import {
  acquireTokenInteractive,
  acquireTokenSilentOrInteractive,
} from "./auth.js";

interface ActiveConnection {
  name: string;
  envUrl: string;
  crmType: string;
  account: AccountInfo | null;
}

app.whenReady().then(() => {
  const mainWindow = new BrowserWindow({
    webPreferences: {
      preload: getPreloadPath(),
    },
    width: 800,
    height: 600,
  });
  mainWindow.maximize();

  if (isDev()) {
    mainWindow.loadURL("http://localhost:5123");
  } else {
    mainWindow.loadFile("dist-react/index.html");
  }

  let connectionWindow: BrowserWindow | null = null;

  ipcMain.handle("create-connection-window", () => {
    if (connectionWindow && !connectionWindow.isDestroyed()) {
      connectionWindow.focus();
      return;
    }

    connectionWindow = new BrowserWindow({
      webPreferences: {
        preload: getPreloadPath(),
      },
      width: 500,
      height: 600,
      autoHideMenuBar: true,
    });

    if (isDev()) {
      connectionWindow.loadURL("http://localhost:5123/#/connection");
    } else {
      connectionWindow.loadFile("dist-react/index.html", {
        hash: "connection",
      });
    }

    connectionWindow.on("closed", () => {
      connectionWindow = null;
    });
  });

  let tempConnectionData: Partial<ActiveConnection> | null = null;
  let activeConnection: ActiveConnection | null = null;

  ipcMain.handle("save-connection-data", async (event, data) => {
    if (data.crmType === "online") {
      const envUrl = data.serverUrl.startsWith("http")
        ? data.serverUrl
        : `https://${data.serverUrl}`;

      try {
        const { account } = await acquireTokenInteractive(envUrl);
        tempConnectionData = {
          name: undefined,
          envUrl,
          crmType: data.crmType,
          account,
        };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    } else {
      tempConnectionData = { ...data };
    }

    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    senderWindow?.close();

    const namingWindow = new BrowserWindow({
      webPreferences: {
        preload: getPreloadPath(),
      },
      width: 400,
      height: 300,
      autoHideMenuBar: true,
    });

    if (isDev()) {
      namingWindow.loadURL("http://localhost:5123/#/connection-naming");
    } else {
      namingWindow.loadFile("dist-react/index.html", {
        hash: "connection-naming",
      });
    }

    return { success: true };
  });

  ipcMain.handle("save-connection-name", (event, name: string) => {
    if (!tempConnectionData) return;
    activeConnection = {
      name,
      envUrl: tempConnectionData.envUrl ?? "",
      crmType: tempConnectionData.crmType ?? "",
      account: tempConnectionData.account ?? null,
    };
    tempConnectionData = null;

    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    senderWindow?.close();

    mainWindow.webContents.send("connection-status-update", name);
  });

  // Hand the renderer a fresh token + environment URL. Silently refreshes
  // via the cached MSAL account; falls back to interactive only if needed.
  async function getConnectionForRenderer() {
    if (!activeConnection) return { error: "Not connected." };

    const { name, envUrl, crmType, account } = activeConnection;
    try {
      const { accessToken, account: refreshedAccount } =
        await acquireTokenSilentOrInteractive(envUrl, account);
      // Persist any refreshed account reference
      activeConnection = { ...activeConnection, account: refreshedAccount };
      return { name, envUrl, crmType, token: accessToken };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  ipcMain.handle("get-active-connection", () => getConnectionForRenderer());
  ipcMain.handle("refresh-token", () => getConnectionForRenderer());
});
