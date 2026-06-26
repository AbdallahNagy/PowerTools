import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { AccountInfo } from "@azure/msal-node";
import { isDev } from "./utils.js";
import { getPreloadPath } from "./pathResolver.js";
import {
  acquireTokenInteractive,
  acquireTokenSilentOrInteractive,
  getAccountByHomeId,
  removeAccount,
} from "./auth.js";
import { loadState, saveState } from "./storage.js";
import * as sidecar from "./sidecar.js";

interface StoredConnection {
  name: string;
  envUrl: string;
  crmType: string;
  homeAccountId: string | null;
  account: AccountInfo | null;
}

app.whenReady().then(async () => {
  // Start the local API process before any window opens. The renderer
  // assumes a working sidecar; if it fails to come up, the app cannot
  // function — surface the error and quit cleanly.
  let sidecarHandle: { baseUrl: string; secret: string };
  try {
    sidecarHandle = await sidecar.start();
  } catch (err) {
    dialog.showErrorBox(
      "PowerTools failed to start",
      `The local API process did not start.\n\n${(err as Error).message}`
    );
    app.quit();
    return;
  }

  app.on("before-quit", sidecar.stop);
  process.on("exit", sidecar.stop);

  ipcMain.handle("get-api-base-url", () => sidecarHandle.baseUrl);
  ipcMain.handle("get-local-secret", () => sidecarHandle.secret);

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

  // Restore persisted connections (accounts are lazily rehydrated from the
  // MSAL cache on first use).
  const persisted = loadState();
  for (const c of persisted.connections) {
    connections[c.name] = {
      name: c.name,
      envUrl: c.envUrl,
      crmType: c.crmType,
      homeAccountId: c.homeAccountId,
      account: null,
    };
  }
  activeConnectionName = persisted.activeConnectionName;

  function persist() {
    saveState({
      connections: Object.values(connections).map((c) => ({
        name: c.name,
        envUrl: c.envUrl,
        crmType: c.crmType,
        homeAccountId: c.homeAccountId,
      })),
      activeConnectionName,
    });
  }

  function broadcastConnections() {
    mainWindow.webContents.send(
      "connections-updated",
      Object.values(connections).map((c) => ({
        name: c.name,
        envUrl: c.envUrl,
        crmType: c.crmType,
      }))
    );
  }

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
      width: 450,
      height: 300,
      autoHideMenuBar: true,
      resizable: false,
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
      homeAccountId: tempConnectionData.account?.homeAccountId ?? null,
      account: tempConnectionData.account ?? null,
    };
    connections[name] = conn;

    // First connection becomes active automatically
    if (activeConnectionName === null) {
      activeConnectionName = name;
    }

    tempConnectionData = null;
    persist();

    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    senderWindow?.close();

    mainWindow.webContents.send("connection-status-update", name);
    broadcastConnections();
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
      persist();
      mainWindow.webContents.send("connection-status-update", name);
      return { success: true };
    }
    return { success: false, error: `Connection "${name}" not found.` };
  });

  ipcMain.handle("delete-connection", async (_event, name: string) => {
    const conn = connections[name];
    if (!conn) return { success: false, error: `Connection "${name}" not found.` };

    // Purge the account (and its refresh token) from the MSAL cache.
    if (conn.homeAccountId) {
      try {
        const account = await getAccountByHomeId(conn.homeAccountId);
        if (account) await removeAccount(account);
      } catch (err) {
        console.error("Failed to remove MSAL account:", err);
      }
    }

    delete connections[name];

    // If the deleted connection was active, fall back to the first remaining.
    if (activeConnectionName === name) {
      const remaining = Object.keys(connections);
      activeConnectionName = remaining.length > 0 ? remaining[0] : null;
      mainWindow.webContents.send(
        "connection-status-update",
        activeConnectionName
      );
    }

    persist();
    broadcastConnections();
    return { success: true };
  });

  async function getConnectionForRenderer(name: string) {
    const conn = connections[name];
    if (!conn) return { error: `Connection "${name}" not found.` };

    try {
      // Rehydrate the account from the persisted MSAL cache if needed.
      let account = conn.account;
      if (!account && conn.homeAccountId) {
        account = await getAccountByHomeId(conn.homeAccountId);
      }

      const { accessToken, account: refreshedAccount } =
        await acquireTokenSilentOrInteractive(conn.envUrl, account);
      connections[name] = {
        ...conn,
        account: refreshedAccount,
        homeAccountId: refreshedAccount?.homeAccountId ?? conn.homeAccountId,
      };
      persist();
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
