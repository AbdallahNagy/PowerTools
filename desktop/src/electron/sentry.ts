import { app } from "electron";
import * as Sentry from "@sentry/electron/main";
import {
  gateTransport,
  loadCrashReportsEnabled,
  resolveDsn,
} from "./crashReports.js";

// Imported first by main.ts so errors during startup are captured.
const dsn = resolveDsn(process.env);

if (dsn) {
  Sentry.init({
    dsn,
    release: `power-tools@${app.getVersion()}`,
    environment: app.isPackaged ? "production" : "development",
    // Only the main-process transport sends. Keep renderer traffic on the
    // preload IPC bridge so the renderer CSP stays closed.
    ipcMode: Sentry.IPCMode.Classic,
    transport: gateTransport(Sentry.makeElectronOfflineTransport(), loadCrashReportsEnabled),
    tracesSampleRate: app.isPackaged ? 0.2 : 1.0,
    // The main process holds tokens, credentials, and Dataverse org URLs.
    // Keep request data, local variables, and IP-derived user info out.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
    // Net breadcrumbs would record Dataverse and sign-in URLs.
    integrations: (defaults) => defaults.filter((integration) => integration.name !== "ElectronNet"),
  });
}
