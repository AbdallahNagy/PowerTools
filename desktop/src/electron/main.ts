import { app, BrowserWindow, ipcMain } from "electron";
import { isDev } from "./utils.js";
import { getPreloadPath } from "./pathResolver.js";

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let activeConnection: any = null;

  ipcMain.handle("save-connection-data", (event, data) => {
    tempConnectionData = data;
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
  });

  ipcMain.handle("save-connection-name", (event, name) => {
    activeConnection = { ...tempConnectionData, name };
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    senderWindow?.close();

    // Notify main window
    mainWindow.webContents.send("connection-status-update", name);
  });
});
