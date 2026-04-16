import { app, BrowserWindow, ipcMain, net } from "electron";
import { isDev } from "./utils.js";
import { getPreloadPath } from "./pathResolver.js";
import { acquireTokenInteractive } from "./auth.js";
import { AZURE_CLIENT_ID } from "./config.js";

interface ActiveConnection {
  name: string;
  envUrl: string;
  token: string;
  crmType: string;
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

  let tempConnectionData: any = null;
  let activeConnection: ActiveConnection | null = null;

  ipcMain.handle("save-connection-data", async (event, data) => {
    if (data.crmType === "online") {
      // Normalize URL: ensure it has https://
      const envUrl = data.serverUrl.startsWith("http")
        ? data.serverUrl
        : `https://${data.serverUrl}`;

      try {
        const token = await acquireTokenInteractive(envUrl, AZURE_CLIENT_ID);
        tempConnectionData = { ...data, envUrl, token };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    } else {
      tempConnectionData = data;
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

  ipcMain.handle("save-connection-name", (event, name) => {
    activeConnection = { ...tempConnectionData, name };
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    senderWindow?.close();

    mainWindow.webContents.send("connection-status-update", name);
  });

  // Proxy API calls from the renderer, injecting the stored Bearer token.
  ipcMain.handle("call-api", (_event, endpoint: string) => {
    if (!activeConnection) {
      return Promise.resolve({ error: "Not connected." });
    }

    const { token, envUrl } = activeConnection;

    return new Promise((resolve) => {
      const request = net.request({
        method: "GET",
        url: `https://localhost:7258${endpoint}`,
      });

      request.setHeader("Authorization", `Bearer ${token}`);
      request.setHeader("X-Environment-Url", envUrl);

      let body = "";
      request.on("response", (response) => {
        response.on("data", (chunk) => {
          body += chunk.toString();
        });
        response.on("end", () => {
          resolve({ status: response.statusCode, data: body });
        });
      });

      request.on("error", (err) => {
        resolve({ error: err.message });
      });

      request.end();
    });
  });
});
