import { app, BrowserWindow, ipcMain } from "electron";
import { AccountInfo } from "@azure/msal-node";
import { isDev } from "./utils.js";
import { getPreloadPath } from "./pathResolver.js";
import {
  acquireTokenInteractive,
  acquireTokenSilentOrInteractive,
} from "./auth.js";

interface StoredConnection {
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

  // Named connection store — key is connection name
  const connections: Record<string, StoredConnection> = {};
  let activeConnectionName: string | null = null;

  // Temp state shared between connection + naming windows
  let tempConnectionData: Partial<StoredConnection> | null = null;

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
    const conn: StoredConnection = {
      name,
      envUrl: tempConnectionData.envUrl ?? "",
      crmType: tempConnectionData.crmType ?? "",
      account: tempConnectionData.account ?? null,
    };
    connections[name] = conn;

    // First connection becomes active automatically
    if (activeConnectionName === null) {
      activeConnectionName = name;
    }

    tempConnectionData = null;

    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    senderWindow?.close();

    mainWindow.webContents.send("connection-status-update", name);
    mainWindow.webContents.send("connections-updated", Object.values(connections).map(c => ({
      name: c.name,
      envUrl: c.envUrl,
      crmType: c.crmType,
    })));
  });

  ipcMain.handle("list-connections", () =>
    Object.values(connections).map((c) => ({
      name: c.name,
      envUrl: c.envUrl,
      crmType: c.crmType,
    }))
  );

  ipcMain.handle("set-active-connection", (_event, name: string) => {
    if (connections[name]) {
      activeConnectionName = name;
      mainWindow.webContents.send("connection-status-update", name);
      return { success: true };
    }
    return { success: false, error: `Connection "${name}" not found.` };
  });

  async function getConnectionForRenderer(name: string) {
    const conn = connections[name];
    if (!conn) return { error: `Connection "${name}" not found.` };

    try {
      const { accessToken, account: refreshedAccount } =
        await acquireTokenSilentOrInteractive(conn.envUrl, conn.account);
      connections[name] = { ...conn, account: refreshedAccount };
      return { name: conn.name, envUrl: conn.envUrl, crmType: conn.crmType, token: accessToken };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  ipcMain.handle("get-connection", (_event, name: string) =>
    getConnectionForRenderer(name)
  );

  // Back-compat: uses whichever connection is currently active
  ipcMain.handle("get-active-connection", () => {
    if (!activeConnectionName) return { error: "Not connected." };
    return getConnectionForRenderer(activeConnectionName);
  });

  ipcMain.handle("refresh-token", () => {
    if (!activeConnectionName) return { error: "Not connected." };
    return getConnectionForRenderer(activeConnectionName);
  });
});
