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

export type ConnectionManagerAction = "import";

export interface ConnectionManagerRequest {
  selectId: string | null;
  action: ConnectionManagerAction | null;
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

/** A community tool's validated powertools-tool.json. Mirrors src/electron/communityTools/manifest.ts. */
export interface CommunityToolManifest {
  manifestVersion: 1;
  id: string;
  name: string;
  description: string;
  version: string;
  publisher: { name: string; url?: string };
  icon: string;
  entry: string;
  minHostVersion: string;
  permissions: string[];
  messages: string[];
  network: string[];
  allowMultipleInstances: boolean;
}

/** A remembered community tool folder. Mirrors src/electron/communityTools/toolStore.ts. */
export interface LoadedCommunityTool {
  /** Manifest id, or the folder path when there is no valid manifest. */
  id: string;
  folder: string;
  status: "ready" | "invalid" | "missing";
  errors: string[];
  manifest: CommunityToolManifest | null;
  /** data:image/svg+xml;base64,... */
  iconDataUrl: string | null;
  /** True when the user consented to the tool's current permissions, messages, and network hosts. */
  consentGranted: boolean;
}

export interface CommunityToolFileFilter {
  name: string;
  extensions: string[];
}

/** A file a community tool opened: its name and text, never its path. */
export type CommunityToolOpenFileResult = { name: string; content: string } | { error: string };

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
  /** Opens Manage connections, optionally selecting a connection or starting an import. */
  openConnectionManager(id?: string | null, action?: ConnectionManagerAction): Promise<void>;
  /** What the manager window was opened for; each request is handed out once. */
  takeConnectionManagerRequest(): Promise<ConnectionManagerRequest | null>;
  onConnectionManagerRequest(callback: (request: ConnectionManagerRequest) => void): () => void;
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
  /** Re-reads every remembered community tool folder and manifest. */
  listCommunityTools(): Promise<LoadedCommunityTool[]>;
  /** Asks for a folder and remembers it. `null` when the user cancels. */
  addCommunityToolFromFolder(): Promise<LoadedCommunityTool | null>;
  removeCommunityTool(id: string): Promise<void>;
  grantCommunityToolConsent(id: string): Promise<void>;
  readCommunityToolStorage(id: string): Promise<Record<string, unknown>>;
  /** Rejects above 1 MB serialized. */
  writeCommunityToolStorage(id: string, data: Record<string, unknown>): Promise<void>;
  /** Asks for a file and reads it as text. `null` when the user cancels. */
  openFileForCommunityTool(id: string, filters: CommunityToolFileFilter[]): Promise<CommunityToolOpenFileResult | null>;
  /** Asks where to save and writes the text. `false` when the user cancels. */
  saveFileForCommunityTool(id: string, suggestedName: string, content: string): Promise<boolean>;
  /** The File > Community tools menu item was chosen. */
  onOpenCommunityTools(callback: () => void): () => void;
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
  openConnectionManager: (id, action) => bridge().openConnectionManager(id, action),
  takeConnectionManagerRequest: () => bridge().takeConnectionManagerRequest(),
  onConnectionManagerRequest: (callback) => bridge().onConnectionManagerRequest(callback),
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
  listCommunityTools: () => bridge().listCommunityTools(),
  addCommunityToolFromFolder: () => bridge().addCommunityToolFromFolder(),
  removeCommunityTool: (id) => bridge().removeCommunityTool(id),
  grantCommunityToolConsent: (id) => bridge().grantCommunityToolConsent(id),
  readCommunityToolStorage: (id) => bridge().readCommunityToolStorage(id),
  writeCommunityToolStorage: (id, data) => bridge().writeCommunityToolStorage(id, data),
  openFileForCommunityTool: (id, filters) => bridge().openFileForCommunityTool(id, filters),
  saveFileForCommunityTool: (id, suggestedName, content) =>
    bridge().saveFileForCommunityTool(id, suggestedName, content),
  onOpenCommunityTools: (callback) => bridge().onOpenCommunityTools(callback),
};
