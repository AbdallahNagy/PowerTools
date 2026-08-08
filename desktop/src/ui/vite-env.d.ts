/// <reference types="vite/client" />

export interface ActiveConnection {
  name: string;
  envUrl: string;
  crmType: "online" | "onpremise";
  token?: string;
  expiresOn?: string | null;
}

export interface ConnectionError {
  error: string;
}

export type ConnectionResult = ActiveConnection | ConnectionError;

export interface ConnectionInfo {
  name: string;
  envUrl: string;
  crmType: "online" | "onpremise";
}

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version?: string }
  | { state: "downloading"; version?: string; percent?: number }
  | { state: "downloaded"; version?: string }
  | { state: "error"; message: string };

type OnPremisesAuthMode = "ad" | "ifd";

type ConnectionInput =
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

declare global {
  interface Window {
    electron: {
      createConnectionWindow: () => Promise<void>;
      saveConnectionData: (data: ConnectionInput) => Promise<{ success: boolean; error?: string }>;
      saveConnectionName: (name: string) => Promise<void>;
      onConnectionStatusUpdate: (callback: (name: string | null) => void) => void;
      onConnectionsUpdated: (callback: (connections: ConnectionInfo[]) => void) => () => void;
      listConnections: () => Promise<ConnectionInfo[]>;
      getConnection: (name: string) => Promise<ConnectionResult>;
      setActiveConnection: (name: string) => Promise<{ success: boolean; error?: string }>;
      deleteConnection: (name: string) => Promise<{ success: boolean; error?: string }>;
      getActiveConnection: () => Promise<ConnectionResult>;
      refreshToken: () => Promise<ConnectionResult>;
      getApiBaseUrl: () => Promise<string>;
      getLocalSecret: () => Promise<string>;
      getAppVersion: () => Promise<string>;
      getUpdateStatus: () => Promise<UpdateStatus>;
      checkForUpdates: () => Promise<void>;
      downloadUpdate: () => Promise<void>;
      installUpdate: () => Promise<void>;
      onUpdateStatusChanged: (callback: (status: UpdateStatus) => void) => () => void;
      openExternalUrl: (url: string) => Promise<void>;
    };
  }
}
