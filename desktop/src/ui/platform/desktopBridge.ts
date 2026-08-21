import type { ConnectionInfo } from "../shared/connections/types";

export type { ConnectionInfo } from "../shared/connections/types";

export interface ActiveConnection extends ConnectionInfo {
  token?: string;
  expiresOn?: string | null;
}

export interface ConnectionError {
  error: string;
}

export type ConnectionResult = ActiveConnection | ConnectionError;

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version?: string }
  | { state: "downloading"; version?: string; percent?: number }
  | { state: "downloaded"; version?: string }
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

export interface DesktopBridge {
  createConnectionWindow(): Promise<void>;
  saveConnectionData(data: ConnectionInput): Promise<DesktopOperationResult>;
  saveConnectionName(name: string): Promise<void>;
  onConnectionStatusUpdate(callback: (name: string | null) => void): void;
  onConnectionsUpdated(callback: (connections: ConnectionInfo[]) => void): () => void;
  listConnections(): Promise<ConnectionInfo[]>;
  getConnection(name: string): Promise<ConnectionResult>;
  setActiveConnection(name: string): Promise<DesktopOperationResult>;
  deleteConnection(name: string): Promise<DesktopOperationResult>;
  getActiveConnectionName(): Promise<string | null>;
  getActiveConnection(): Promise<ConnectionResult>;
  refreshToken(): Promise<ConnectionResult>;
  getApiBaseUrl(): Promise<string>;
  getLocalSecret(): Promise<string>;
  getAppVersion(): Promise<string>;
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdateStatusChanged(callback: (status: UpdateStatus) => void): () => void;
  openExternalUrl(url: string): Promise<void>;
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
  saveConnectionName: (name) => bridge().saveConnectionName(name),
  onConnectionStatusUpdate: (callback) => bridge().onConnectionStatusUpdate(callback),
  onConnectionsUpdated: (callback) => bridge().onConnectionsUpdated(callback),
  listConnections: () => bridge().listConnections(),
  getConnection: (name) => bridge().getConnection(name),
  setActiveConnection: (name) => bridge().setActiveConnection(name),
  deleteConnection: (name) => bridge().deleteConnection(name),
  getActiveConnectionName: () => bridge().getActiveConnectionName(),
  getActiveConnection: () => bridge().getActiveConnection(),
  refreshToken: () => bridge().refreshToken(),
  getApiBaseUrl: () => bridge().getApiBaseUrl(),
  getLocalSecret: () => bridge().getLocalSecret(),
  getAppVersion: () => bridge().getAppVersion(),
  getUpdateStatus: () => bridge().getUpdateStatus(),
  checkForUpdates: () => bridge().checkForUpdates(),
  downloadUpdate: () => bridge().downloadUpdate(),
  installUpdate: () => bridge().installUpdate(),
  onUpdateStatusChanged: (callback) => bridge().onUpdateStatusChanged(callback),
  openExternalUrl: (url) => bridge().openExternalUrl(url),
};
