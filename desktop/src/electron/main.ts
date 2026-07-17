import { app, BrowserWindow, dialog, ipcMain } from "electron";
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
import {
  registerOnPremisesConnection,
  unregisterOnPremisesConnection,
  validateDataverseConnection,
  validateOnPremisesConnection,
} from "./connectionValidation.js";
import type {
  ConnectionInput,
  StoredConnection,
  StoredOnlineConnection,
  StoredOnPremisesConnection,
} from "./connectionTypes.js";
import { decryptCredential, encryptCredential } from "./secureCredentials.js";

type PendingConnection =
  | Omit<StoredOnlineConnection, "name">
  | Omit<StoredOnPremisesConnection, "name">;

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

  let connectionWindow: BrowserWindow | null = null;

  // Named connection store — key is connection name
  const connections: Record<string, StoredConnection> = {};
  let activeConnectionName: string | null = null;

  // Restore persisted connections (accounts are lazily rehydrated from the
  // MSAL cache on first use).
  const persisted = loadState();
  for (const c of persisted.connections) {
    connections[c.name] = c.crmType === "online"
      ? {
          name: c.name,
          envUrl: c.envUrl,
          crmType: "online",
          homeAccountId: c.homeAccountId,
          account: null,
        }
      : {
          name: c.name,
          envUrl: c.envUrl,
          crmType: "onpremise",
          authMode: c.authMode,
          username: c.username,
          domain: c.domain,
          encryptedPassword: c.encryptedPassword,
        };
  }
  activeConnectionName = persisted.activeConnectionName;

  function persist() {
    saveState({
      connections: Object.values(connections).map((c) =>
        c.crmType === "online"
          ? {
              name: c.name,
              envUrl: c.envUrl,
              crmType: "online",
              homeAccountId: c.homeAccountId,
            }
          : {
              name: c.name,
              envUrl: c.envUrl,
              crmType: "onpremise",
              authMode: c.authMode,
              username: c.username,
              domain: c.domain,
              encryptedPassword: c.encryptedPassword,
            }
      ),
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
  let tempConnectionData: PendingConnection | null = null;

  function normalizeEnvUrl(serverUrl: string) {
    return serverUrl.startsWith("http") ? serverUrl : `https://${serverUrl}`;
  }

  async function registerStoredOnPremisesConnection(conn: StoredOnPremisesConnection) {
    await registerOnPremisesConnection({
      apiBaseUrl: sidecarHandle.baseUrl,
      localSecret: sidecarHandle.secret,
      name: conn.name,
      envUrl: conn.envUrl,
      authMode: conn.authMode,
      username: conn.username,
      password: decryptCredential(conn.encryptedPassword),
      domain: conn.domain,
    });
  }

  async function registerRestoredOnPremisesConnections() {
    for (const conn of Object.values(connections)) {
      if (conn.crmType === "onpremise") {
        try {
          await registerStoredOnPremisesConnection(conn);
        } catch (err) {
          console.error(`Failed to register on-premises connection "${conn.name}":`, err);
        }
      }
    }
  }

  async function unregisterStoredOnPremisesConnection(conn: StoredOnPremisesConnection) {
    await unregisterOnPremisesConnection({
      apiBaseUrl: sidecarHandle.baseUrl,
      localSecret: sidecarHandle.secret,
      name: conn.name,
    });
  }

  async function ensureOnPremisesConnectionRegistered(conn: StoredOnPremisesConnection) {
    try {
      await registerStoredOnPremisesConnection(conn);
      return true;
    } catch (err) {
      console.error(`Failed to register on-premises connection "${conn.name}":`, err);
      return false;
    }
  }

  await registerRestoredOnPremisesConnections();

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

  ipcMain.handle("save-connection-data", async (event, data: ConnectionInput) => {
    if (data.crmType === "online") {
      const envUrl = normalizeEnvUrl(data.serverUrl);

      try {
        const { accessToken, account } = await acquireTokenInteractive(envUrl);
        await validateDataverseConnection({
          apiBaseUrl: sidecarHandle.baseUrl,
          localSecret: sidecarHandle.secret,
          envUrl,
          accessToken,
        });
        tempConnectionData = {
          envUrl,
          crmType: "online",
          homeAccountId: account?.homeAccountId ?? null,
          account,
        };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    } else {
      const envUrl = normalizeEnvUrl(data.serverUrl);

      try {
        await validateOnPremisesConnection({
          apiBaseUrl: sidecarHandle.baseUrl,
          localSecret: sidecarHandle.secret,
          name: "__validation__",
          envUrl,
          authMode: data.authMode,
          username: data.username,
          password: data.password,
          domain: data.domain,
        });
        tempConnectionData = {
          envUrl,
          crmType: "onpremise",
          authMode: data.authMode,
          username: data.username,
          domain: data.domain,
          encryptedPassword: encryptCredential(data.password),
        };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
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

  ipcMain.handle("save-connection-name", async (event, name: string) => {
    if (!tempConnectionData) return;
    const conn: StoredConnection = tempConnectionData.crmType === "online"
      ? {
          name,
          envUrl: tempConnectionData.envUrl,
          crmType: "online",
          homeAccountId: tempConnectionData.account?.homeAccountId ?? null,
          account: tempConnectionData.account,
        }
      : {
          name,
          envUrl: tempConnectionData.envUrl,
          crmType: "onpremise",
          authMode: tempConnectionData.authMode,
          username: tempConnectionData.username,
          domain: tempConnectionData.domain,
          encryptedPassword: tempConnectionData.encryptedPassword,
        };

    connections[name] = conn;

    // First connection becomes active automatically
    if (activeConnectionName === null) {
      activeConnectionName = name;
    }

    tempConnectionData = null;
    persist();

    if (conn.crmType === "onpremise") {
      void ensureOnPremisesConnectionRegistered(conn);
    }

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
    if (conn.crmType === "online" && conn.homeAccountId) {
      try {
        const account = await getAccountByHomeId(conn.homeAccountId);
        if (account) await removeAccount(account);
      } catch (err) {
        console.error("Failed to remove MSAL account:", err);
      }
    }
    if (conn.crmType === "onpremise") {
      try {
        await unregisterStoredOnPremisesConnection(conn);
      } catch (err) {
        console.error("Failed to unregister on-premises connection:", err);
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

    if (conn.crmType === "onpremise") {
      try {
        await registerStoredOnPremisesConnection(conn);
        return { name: conn.name, envUrl: conn.envUrl, crmType: conn.crmType };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }
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
});
