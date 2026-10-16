import { BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from "electron";
import {
  acquireTokenInteractive,
  acquireTokenSilentOrInteractive,
  getAccountByHomeId,
  removeAccount,
} from "./auth.js";
import {
  registerOnPremisesConnection,
  unregisterOnPremisesConnection,
  validateDataverseConnection,
  validateOnPremisesConnection,
} from "./connectionValidation.js";
import type { BrowserLauncher } from "./browserLauncher.js";
import {
  classifyImport,
  commitImport,
  exportConnections,
  parseImportFile,
  type ImportEntry,
} from "./connectionImportExport.js";
import { cleanBrowser, cleanText, type ConnectionStore, type DescriptionPatch } from "./connectionStore.js";
import type {
  ConnectionInput,
  StoredConnection,
  StoredOnlineConnection,
  StoredOnPremisesConnection,
} from "./connectionTypes.js";
import { decryptCredential, encryptCredential } from "./secureCredentials.js";

type PendingConnection =
  | Omit<StoredOnlineConnection, "id" | "organization" | "environment" | "browser">
  | Omit<StoredOnPremisesConnection, "id" | "organization" | "environment" | "browser">;

export type ConnectionWindowRoute = "connection" | "connection-details" | "connections";

export interface ConnectionIpcDeps {
  ipcMain: IpcMain;
  store: ConnectionStore;
  launcher: BrowserLauncher;
  sidecar: { baseUrl: string; secret: string };
  getMainWindow: () => BrowserWindow | null;
  /** File dialogs and file access for import and export. */
  files: {
    chooseSaveFile: (window: BrowserWindow | null, defaultName: string) => Promise<string | null>;
    chooseOpenFile: (window: BrowserWindow | null) => Promise<string | null>;
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
  };
  /** Opens a renderer route in its own window. */
  openWindow: (route: ConnectionWindowRoute, options: { width: number; height: number; resizable?: boolean }) => BrowserWindow;
}

export function normalizeEnvUrl(serverUrl: string) {
  const trimmed = serverUrl.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** Reads a description patch from the renderer. Unknown keys are dropped. */
export function parseDescriptionPatch(value: unknown): DescriptionPatch {
  if (typeof value !== "object" || value === null) return {};
  const input = value as Record<string, unknown>;
  const patch: DescriptionPatch = {};
  if ("organization" in input) patch.organization = cleanText(input.organization);
  if ("environment" in input) patch.environment = cleanText(input.environment);
  if ("browser" in input) patch.browser = input.browser as DescriptionPatch["browser"];
  return patch;
}

export function registerConnectionIpc({
  ipcMain,
  store,
  launcher,
  sidecar,
  getMainWindow,
  files,
  openWindow,
}: ConnectionIpcDeps) {
  const windows: Partial<Record<ConnectionWindowRoute, BrowserWindow>> = {};
  // Signed-in connection waiting for the user to describe it.
  let pending: PendingConnection | null = null;
  // Connections read from the last import file, waiting for the user to pick.
  let pendingImport: ImportEntry[] = [];
  // What the manager window should do once it has loaded.
  let pendingManagerRequest: { selectId: string | null; action: "import" | null } | null = null;

  function showWindow(
    route: ConnectionWindowRoute,
    options: { width: number; height: number; resizable?: boolean },
  ) {
    const existing = windows[route];
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return existing;
    }
    const window = openWindow(route, options);
    windows[route] = window;
    window.on("closed", () => {
      if (windows[route] === window) delete windows[route];
    });
    return window;
  }

  function sendToAll(channel: string, payload: unknown) {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(channel, payload);
    }
  }

  function broadcastConnections() {
    sendToAll("connections-updated", store.summaries());
  }

  function broadcastActive() {
    getMainWindow()?.webContents.send("connection-status-update", store.activeId);
  }

  async function registerStoredOnPremises(conn: StoredOnPremisesConnection) {
    await registerOnPremisesConnection({
      apiBaseUrl: sidecar.baseUrl,
      localSecret: sidecar.secret,
      // The sidecar keys on-premises connections by this value; it is the id.
      name: conn.id,
      envUrl: conn.envUrl,
      authMode: conn.authMode,
      username: conn.username,
      password: decryptCredential(conn.encryptedPassword),
      domain: conn.domain,
    });
  }

  async function registerRestoredOnPremises() {
    for (const conn of store.list()) {
      if (conn.crmType !== "onpremise" || conn.needsPassword) continue;
      try {
        await registerStoredOnPremises(conn);
      } catch (err) {
        console.error(`Failed to register on-premises connection ${conn.envUrl}:`, err);
      }
    }
  }

  async function unregisterStoredOnPremises(conn: StoredOnPremisesConnection) {
    await unregisterOnPremisesConnection({
      apiBaseUrl: sidecar.baseUrl,
      localSecret: sidecar.secret,
      name: conn.id,
    });
  }

  async function getConnectionForRenderer(id: string) {
    const conn = store.get(id);
    if (!conn) return { error: "Connection not found." };

    if (conn.crmType === "onpremise") {
      if (conn.needsPassword) {
        return { error: "Enter the password for this connection in Manage connections." };
      }
      try {
        await registerStoredOnPremises(conn);
        return { id: conn.id, envUrl: conn.envUrl, crmType: conn.crmType };
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

      const { accessToken, account: refreshedAccount, expiresOn } =
        await acquireTokenSilentOrInteractive(conn.envUrl, account);
      store.replace({
        ...conn,
        account: refreshedAccount,
        homeAccountId: refreshedAccount?.homeAccountId ?? conn.homeAccountId,
      });
      return {
        id: conn.id,
        envUrl: conn.envUrl,
        crmType: conn.crmType,
        token: accessToken,
        expiresOn: expiresOn?.toISOString() ?? null,
      };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  async function forgetCredentials(conn: StoredConnection) {
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
        await unregisterStoredOnPremises(conn);
      } catch (err) {
        console.error("Failed to unregister on-premises connection:", err);
      }
    }
  }

  function openManager(selectId?: string | null, action?: "import" | null) {
    const window = showWindow("connections", { width: 900, height: 620 });
    if (selectId || action) {
      // A window that is still loading asks for the request itself.
      pendingManagerRequest = { selectId: selectId ?? null, action: action ?? null };
      window.webContents.send("connection-manager-request", pendingManagerRequest);
    }
  }

  ipcMain.handle("create-connection-window", () => {
    showWindow("connection", { width: 500, height: 600 });
  });

  ipcMain.handle("save-connection-data", async (event: IpcMainInvokeEvent, data: ConnectionInput) => {
    const envUrl = normalizeEnvUrl(data.serverUrl);
    try {
      if (data.crmType === "online") {
        const { accessToken, account } = await acquireTokenInteractive(envUrl);
        await validateDataverseConnection({
          apiBaseUrl: sidecar.baseUrl,
          localSecret: sidecar.secret,
          envUrl,
          accessToken,
        });
        pending = {
          envUrl,
          crmType: "online",
          homeAccountId: account?.homeAccountId ?? null,
          account,
        };
      } else {
        await validateOnPremisesConnection({
          apiBaseUrl: sidecar.baseUrl,
          localSecret: sidecar.secret,
          name: "__validation__",
          envUrl,
          authMode: data.authMode,
          username: data.username,
          password: data.password,
          domain: data.domain,
        });
        pending = {
          envUrl,
          crmType: "onpremise",
          authMode: data.authMode,
          username: data.username,
          domain: data.domain,
          encryptedPassword: encryptCredential(data.password),
        };
      }
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }

    BrowserWindow.fromWebContents(event.sender)?.close();
    showWindow("connection-details", { width: 480, height: 560 });
    return { success: true };
  });

  ipcMain.handle("get-pending-connection", () =>
    pending ? { envUrl: pending.envUrl, crmType: pending.crmType } : null,
  );

  ipcMain.handle("save-connection-details", async (event: IpcMainInvokeEvent, value: unknown) => {
    if (!pending) return { success: false, error: "Sign in to the environment again." };
    const patch = parseDescriptionPatch(value);
    if (!patch.organization || !patch.environment) {
      return { success: false, error: "Enter an organization and an environment." };
    }
    const hadActive = store.activeId !== null;
    const result = store.add({
      ...pending,
      organization: patch.organization,
      environment: patch.environment,
      browser: patch.browser ?? null,
    });
    if (!result.success) return result;

    pending = null;
    const conn = result.value;
    if (conn.crmType === "onpremise") {
      void registerStoredOnPremises(conn).catch((err) => {
        console.error("Failed to register on-premises connection:", err);
      });
    }

    BrowserWindow.fromWebContents(event.sender)?.close();
    // First connection becomes active automatically. Later saves stay on the
    // tab that asked for them and leave the active connection unchanged.
    if (!hadActive) broadcastActive();
    broadcastConnections();
    return { success: true, id: conn.id };
  });

  ipcMain.handle("list-connections", () => store.summaries());

  ipcMain.handle("set-active-connection", (_event, id: unknown) => {
    if (isString(id) && store.setActive(id)) {
      broadcastActive();
      return { success: true };
    }
    return { success: false, error: "Connection not found." };
  });

  ipcMain.handle("delete-connection", async (_event, id: unknown) => {
    const conn = isString(id) ? store.get(id) : null;
    if (!conn) return { success: false, error: "Connection not found." };

    await forgetCredentials(conn);
    const wasActive = store.activeId === conn.id;
    store.remove(conn.id);
    if (wasActive) broadcastActive();
    broadcastConnections();
    return { success: true };
  });

  ipcMain.handle("update-connection", async (_event, id: unknown, value: unknown) => {
    const conn = isString(id) ? store.get(id) : null;
    if (!conn) return { success: false, error: "Connection not found." };

    const result = store.describe(conn.id, parseDescriptionPatch(value));
    if (!result.success) return result;

    const password = typeof value === "object" && value !== null
      ? (value as Record<string, unknown>).password
      : undefined;
    let updated = result.value;
    if (updated.crmType === "onpremise" && isString(password) && password.length > 0) {
      updated = { ...updated, encryptedPassword: encryptCredential(password) };
      delete updated.needsPassword;
      store.replace(updated);
      try {
        await registerStoredOnPremises(updated);
      } catch (err) {
        broadcastConnections();
        return { success: false, error: (err as Error).message };
      }
    }

    broadcastConnections();
    return { success: true };
  });

  ipcMain.handle("get-connection", (_event, id: unknown) =>
    isString(id) ? getConnectionForRenderer(id) : { error: "Connection not found." },
  );

  ipcMain.handle("get-active-connection-id", () => store.activeId);

  // Back-compat: uses whichever connection is currently active
  ipcMain.handle("get-active-connection", () => {
    if (!store.activeId) return { error: "Not connected." };
    return getConnectionForRenderer(store.activeId);
  });

  ipcMain.handle("refresh-token", () => {
    if (!store.activeId) return { error: "Not connected." };
    return getConnectionForRenderer(store.activeId);
  });

  ipcMain.handle("open-connection-manager", (_event, id: unknown, action: unknown) => {
    openManager(isString(id) ? id : null, action === "import" ? "import" : null);
  });

  ipcMain.handle("list-browsers", () => {
    // Read again each time a form asks, so a browser installed meanwhile shows up.
    launcher.refresh();
    return launcher.list();
  });

  ipcMain.handle("open-url-for-connection", (_event, id: unknown, url: unknown) => {
    const connectionId = isString(id) ? id : store.activeId;
    const conn = connectionId ? store.get(connectionId) : null;
    return launcher.openUrl(url, conn?.browser ?? null);
  });

  ipcMain.handle("open-url-in-browser", (_event, browser: unknown, url: unknown) =>
    launcher.openUrl(url, cleanBrowser(browser)),
  );

  async function exportToFile(window: BrowserWindow | null, ids: unknown) {
    const chosen = Array.isArray(ids)
      ? store.list().filter((conn) => ids.includes(conn.id))
      : store.list();
    if (chosen.length === 0) return { success: false, error: "There are no connections to export." };
    const path = await files.chooseSaveFile(
      window,
      `powertools-connections-${new Date().toISOString().slice(0, 10)}.json`,
    );
    if (!path) return { success: false, cancelled: true };
    try {
      await files.writeFile(path, exportConnections(chosen));
      return { success: true, count: chosen.length };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  ipcMain.handle("export-connections", (event: IpcMainInvokeEvent, ids: unknown) =>
    exportToFile(BrowserWindow.fromWebContents(event.sender), ids),
  );

  ipcMain.handle("preview-connection-import", async (event: IpcMainInvokeEvent) => {
    const path = await files.chooseOpenFile(BrowserWindow.fromWebContents(event.sender));
    if (!path) return null;
    const parsed = parseImportFile(await files.readFile(path));
    pendingImport = classifyImport(parsed.entries, store.list());
    return {
      source: parsed.source,
      fileName: path.split(/[\\/]/).pop() ?? path,
      items: pendingImport.map(({ key, organization, environment, legacyName, envUrl, crmType, status, reason }) => ({
        key,
        organization,
        environment,
        legacyName,
        envUrl,
        crmType,
        status,
        ...(reason ? { reason } : {}),
      })),
    };
  });

  ipcMain.handle("commit-connection-import", (_event, keys: unknown) => {
    if (!Array.isArray(keys)) return { success: false, error: "Choose the connections to import." };
    const hadActive = store.activeId !== null;
    const imported = commitImport(store, pendingImport, keys.filter(isString));
    pendingImport = [];
    if (!hadActive && store.activeId) broadcastActive();
    broadcastConnections();
    return { success: true, imported };
  });

  ipcMain.handle("take-connection-manager-request", () => {
    const request = pendingManagerRequest;
    pendingManagerRequest = null;
    return request;
  });

  return {
    registerRestoredOnPremises,
    openManager,
    openAddConnection: () => showWindow("connection", { width: 500, height: 600 }),
    exportToFile,
    broadcastConnections,
    broadcastActive,
    getConnectionForRenderer,
  };
}
