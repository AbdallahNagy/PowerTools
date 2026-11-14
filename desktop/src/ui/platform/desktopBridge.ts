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

/** One agent tool call in the activity log. Mirrors src/electron/mcp/activityLog.ts. */
export interface McpActivityEntry {
  time: string;
  client: string | null;
  tool: string;
  connection: string | null;
  effect: "read" | "change" | "destructive";
  approval: "not-needed" | "auto" | "allowed" | "denied" | "timed-out" | "unavailable" | "cancelled";
  outcome: "ok" | "error";
  code?: string;
  summary: string;
}

/** An agent call waiting for the user. Mirrors ApprovalRequest in src/electron/mcp/approval.ts. */
export interface McpApprovalRequest {
  id: string;
  tool: string;
  title: string;
  connection: string;
  effect: "change" | "destructive";
  summary: string;
  removes?: string;
  args: Record<string, unknown>;
}

/** One agent tool as Settings lists it. "varies" means the effect depends on the arguments. */
export interface McpToolInfo {
  name: string;
  title: string;
  description: string;
  group: string;
  effect: "read" | "change" | "destructive" | "varies";
  enabled: boolean;
}

export type ThemePreference = "system" | "dark" | "light";
export type SettingsFolder = "data" | "mcp-activity";

/** App preferences shown in Settings. Mirrors AppSettings in src/electron/appSettingsIpc.ts. */
export interface AppSettings {
  theme: ThemePreference;
  usageStats: boolean;
  crashReports: boolean;
  version: string;
}

/** The MCP server's state for the Agents dialog. Mirrors McpStatusInfo in src/electron/mcp/mcpIpc.ts. */
export interface McpStatusInfo {
  enabled: boolean;
  running: boolean;
  port: number | null;
  discoveryPath: string;
  error: string | null;
  /** The connector launch as one pasteable line. */
  connectorCommand: string;
  connector: { command: string; args: string[] };
  recent: McpActivityEntry[];
  /** Every tool group, with whether it is on and how many tools it has. */
  groups: Array<{ group: string; enabled: boolean; tools: number }>;
  /** Every agent tool, with whether the user left it on. */
  tools: McpToolInfo[];
  /** The direct HTTP option. The token is never part of it. */
  http: { enabled: boolean; port: number };
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
  /** Total size of the tool's folder, for the load log. */
  getCommunityToolBundleSize(id: string): Promise<{ bytes: number; files: number }>;
  openFileForCommunityTool(id: string, filters: CommunityToolFileFilter[]): Promise<CommunityToolOpenFileResult | null>;
  /** Asks where to save and writes the text. `false` when the user cancels. */
  saveFileForCommunityTool(id: string, suggestedName: string, content: string): Promise<boolean>;
  /** The File > Community tools menu item was chosen. */
  onOpenCommunityTools(callback: () => void): () => void;
  /** State of the MCP server, how to start the connector, and recent agent activity. */
  getMcpStatus(): Promise<McpStatusInfo>;
  /** Turns the MCP server on or off and remembers the choice. */
  setMcpEnabled(enabled: boolean): Promise<McpStatusInfo>;
  getMcpActivity(limit: number): Promise<McpActivityEntry[]>;
  /** Turns a group of agent tools on or off. */
  setMcpGroup(group: string, enabled: boolean): Promise<McpStatusInfo>;
  /** Turns one agent tool on or off. */
  setMcpTool(name: string, enabled: boolean): Promise<McpStatusInfo>;
  /** Turns the direct HTTP option on or off and sets its port. */
  setMcpHttp(http: { enabled: boolean; port: number }): Promise<McpStatusInfo>;
  /** Copies the direct HTTP client config to the clipboard. Main does the copying; no token comes back. */
  copyMcpHttpConfig(): Promise<void>;
  /** Replaces the HTTP token. Clients using the old config stop working. */
  regenerateMcpHttpToken(): Promise<McpStatusInfo>;
  /** The File > Agents (MCP) menu item was chosen. */
  onOpenAgents(callback: () => void): () => void;
  /** The File > Settings menu item was chosen. */
  onOpenSettings(callback: () => void): () => void;
  /** A preference changed outside Settings (the native menu). */
  onAppSettingsChanged(callback: () => void): () => void;
  getAppSettings(): Promise<AppSettings>;
  setThemePreference(theme: ThemePreference): Promise<AppSettings>;
  setUsageStatsEnabled(enabled: boolean): Promise<AppSettings>;
  setCrashReportsEnabled(enabled: boolean): Promise<AppSettings>;
  /** Opens a fixed app folder in the file manager. */
  openSettingsFolder(folder: SettingsFolder): Promise<void>;
  /** An agent call needs the user's answer. */
  onMcpApprovalPresent(callback: (request: McpApprovalRequest) => void): () => void;
  /** An approval request was answered elsewhere or gave up; take its dialog down. */
  onMcpApprovalDismiss(callback: (id: string) => void): () => void;
  respondMcpApproval(id: string, allow: boolean): Promise<void>;
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
  getCommunityToolBundleSize: (id) => bridge().getCommunityToolBundleSize(id),
  openFileForCommunityTool: (id, filters) => bridge().openFileForCommunityTool(id, filters),
  saveFileForCommunityTool: (id, suggestedName, content) =>
    bridge().saveFileForCommunityTool(id, suggestedName, content),
  onOpenCommunityTools: (callback) => bridge().onOpenCommunityTools(callback),
  getMcpStatus: () => bridge().getMcpStatus(),
  setMcpEnabled: (enabled) => bridge().setMcpEnabled(enabled),
  getMcpActivity: (limit) => bridge().getMcpActivity(limit),
  setMcpGroup: (group, enabled) => bridge().setMcpGroup(group, enabled),
  setMcpTool: (name, enabled) => bridge().setMcpTool(name, enabled),
  setMcpHttp: (http) => bridge().setMcpHttp(http),
  copyMcpHttpConfig: () => bridge().copyMcpHttpConfig(),
  regenerateMcpHttpToken: () => bridge().regenerateMcpHttpToken(),
  onOpenAgents: (callback) => bridge().onOpenAgents(callback),
  onOpenSettings: (callback) => bridge().onOpenSettings(callback),
  onAppSettingsChanged: (callback) => bridge().onAppSettingsChanged(callback),
  getAppSettings: () => bridge().getAppSettings(),
  setThemePreference: (theme) => bridge().setThemePreference(theme),
  setUsageStatsEnabled: (enabled) => bridge().setUsageStatsEnabled(enabled),
  setCrashReportsEnabled: (enabled) => bridge().setCrashReportsEnabled(enabled),
  openSettingsFolder: (folder) => bridge().openSettingsFolder(folder),
  onMcpApprovalPresent: (callback) => bridge().onMcpApprovalPresent(callback),
  onMcpApprovalDismiss: (callback) => bridge().onMcpApprovalDismiss(callback),
  respondMcpApproval: (id, allow) => bridge().respondMcpApproval(id, allow),
};
