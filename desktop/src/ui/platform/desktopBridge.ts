import type {
  BrowserChoice,
  ConnectionDescription,
  ConnectionSummary,
  ConnectionUpdate,
  ImportPreview,
  InstalledBrowser,
} from "../shared/connections/types";

export interface ActiveConnection {
  id: string;
  envUrl: string;
  crmType: "online" | "onpremise";
  token?: string;
  expiresOn?: string | null;
}

export interface ConnectionError {
  error: string;
}

export type ConnectionResult = ActiveConnection | ConnectionError;

export type UpdateDetails = {
  version?: string;
  releaseName?: string;
  releaseDate?: string;
  /** Release notes as HTML from the GitHub release. Never inject it as markup. */
  releaseNotes?: string;
};

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | ({ state: "available" } & UpdateDetails)
  | ({ state: "downloading"; percent?: number } & UpdateDetails)
  | ({ state: "downloaded" } & UpdateDetails)
  | { state: "error"; message: string };

export type OnPremisesAuthMode = "ad" | "ifd";

export type ConnectionInput =
  | {
      crmType: "online";
      serverUrl: string;
    }
  | {
      crmType: "onpremise";
      serverUrl: string;
      authMode: OnPremisesAuthMode;
      username: string;
      password: string;
      domain: string;
    };

export interface DesktopOperationResult {
  success: boolean;
  error?: string;
}

export interface SaveConnectionResult extends DesktopOperationResult {
  id?: string;
}

export interface OpenUrlResult {
  /** The chosen browser or profile was not found, so the system default browser opened the link. */
  fallback: boolean;
}

export interface ExportConnectionsResult extends DesktopOperationResult {
  cancelled?: boolean;
  count?: number;
}

export interface ImportConnectionsResult extends DesktopOperationResult {
  imported?: number;
}

export interface DesktopBridge {
  createConnectionWindow(): Promise<void>;
  saveConnectionData(data: ConnectionInput): Promise<DesktopOperationResult>;
  getPendingConnection(): Promise<{ envUrl: string; crmType: "online" | "onpremise" } | null>;
  saveConnectionDetails(description: ConnectionDescription): Promise<SaveConnectionResult>;
  onConnectionStatusUpdate(callback: (id: string | null) => void): void;
  onConnectionsUpdated(callback: (connections: ConnectionSummary[]) => void): () => void;
  listConnections(): Promise<ConnectionSummary[]>;
  getConnection(id: string): Promise<ConnectionResult>;
  setActiveConnection(id: string): Promise<DesktopOperationResult>;
  deleteConnection(id: string): Promise<DesktopOperationResult>;
  updateConnection(id: string, update: ConnectionUpdate): Promise<DesktopOperationResult>;
  getActiveConnectionId(): Promise<string | null>;
  getActiveConnection(): Promise<ConnectionResult>;
  refreshToken(): Promise<ConnectionResult>;
  openConnectionManager(id?: string | null): Promise<void>;
  takeConnectionManagerSelection(): Promise<string | null>;
  onConnectionManagerSelect(callback: (id: string) => void): () => void;
  listBrowsers(): Promise<InstalledBrowser[]>;
  /** Opens a URL with the connection's browser and profile. `null` uses the active connection. */
  openUrlForConnection(id: string | null, url: string): Promise<OpenUrlResult>;
  openUrlInBrowser(browser: BrowserChoice | null, url: string): Promise<OpenUrlResult>;
  exportConnections(ids?: string[]): Promise<ExportConnectionsResult>;
  /** Asks for a file and reads it. `null` when the user cancels. */
  previewConnectionImport(): Promise<ImportPreview | null>;
  commitConnectionImport(keys: string[]): Promise<ImportConnectionsResult>;
  getApiBaseUrl(): Promise<string>;
  getLocalSecret(): Promise<string>;
  getAppVersion(): Promise<string>;
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdateStatusChanged(callback: (status: UpdateStatus) => void): () => void;
  openExternalUrl(url: string): Promise<void>;
  popupAppMenu(menuId: "file" | "edit" | "view" | "help", x: number, y: number): Promise<void>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  isWindowMaximized(): Promise<boolean>;
  onWindowMaximizedChanged(callback: (maximized: boolean) => void): () => void;
}

declare global {
  interface Window {
    electron: DesktopBridge;
  }
}

export function getDesktopBridge(): DesktopBridge | undefined {
  return (window as Window & { electron?: DesktopBridge }).electron;
}

function bridge(): DesktopBridge {
  return getDesktopBridge() as DesktopBridge;
}

export const desktopBridge: DesktopBridge = {
  createConnectionWindow: () => bridge().createConnectionWindow(),
  saveConnectionData: (data) => bridge().saveConnectionData(data),
  getPendingConnection: () => bridge().getPendingConnection(),
  saveConnectionDetails: (description) => bridge().saveConnectionDetails(description),
  onConnectionStatusUpdate: (callback) => bridge().onConnectionStatusUpdate(callback),
  onConnectionsUpdated: (callback) => bridge().onConnectionsUpdated(callback),
  listConnections: () => bridge().listConnections(),
  getConnection: (id) => bridge().getConnection(id),
  setActiveConnection: (id) => bridge().setActiveConnection(id),
  deleteConnection: (id) => bridge().deleteConnection(id),
  updateConnection: (id, update) => bridge().updateConnection(id, update),
  getActiveConnectionId: () => bridge().getActiveConnectionId(),
  getActiveConnection: () => bridge().getActiveConnection(),
  refreshToken: () => bridge().refreshToken(),
  openConnectionManager: (id) => bridge().openConnectionManager(id),
  takeConnectionManagerSelection: () => bridge().takeConnectionManagerSelection(),
  onConnectionManagerSelect: (callback) => bridge().onConnectionManagerSelect(callback),
  listBrowsers: () => bridge().listBrowsers(),
  openUrlForConnection: (id, url) => bridge().openUrlForConnection(id, url),
  openUrlInBrowser: (browser, url) => bridge().openUrlInBrowser(browser, url),
  exportConnections: (ids) => bridge().exportConnections(ids),
  previewConnectionImport: () => bridge().previewConnectionImport(),
  commitConnectionImport: (keys) => bridge().commitConnectionImport(keys),
  getApiBaseUrl: () => bridge().getApiBaseUrl(),
  getLocalSecret: () => bridge().getLocalSecret(),
  getAppVersion: () => bridge().getAppVersion(),
  getUpdateStatus: () => bridge().getUpdateStatus(),
  checkForUpdates: () => bridge().checkForUpdates(),
  downloadUpdate: () => bridge().downloadUpdate(),
  installUpdate: () => bridge().installUpdate(),
  onUpdateStatusChanged: (callback) => bridge().onUpdateStatusChanged(callback),
  openExternalUrl: (url) => bridge().openExternalUrl(url),
  popupAppMenu: (menuId, x, y) => bridge().popupAppMenu(menuId, x, y),
  minimizeWindow: () => bridge().minimizeWindow(),
  toggleMaximizeWindow: () => bridge().toggleMaximizeWindow(),
  closeWindow: () => bridge().closeWindow(),
  isWindowMaximized: () => bridge().isWindowMaximized(),
  onWindowMaximizedChanged: (callback) => bridge().onWindowMaximizedChanged(callback),
};
