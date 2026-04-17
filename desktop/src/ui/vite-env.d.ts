/// <reference types="vite/client" />

export interface ActiveConnection {
  name: string;
  envUrl: string;
  crmType: string;
  token: string;
}

export interface ConnectionError {
  error: string;
}

export type ConnectionResult = ActiveConnection | ConnectionError;

export interface ConnectionInfo {
  name: string;
  envUrl: string;
  crmType: string;
}

declare global {
  interface Window {
    electron: {
      createConnectionWindow: () => Promise<void>;
      saveConnectionData: (
        data: unknown
      ) => Promise<{ success: boolean; error?: string }>;
      saveConnectionName: (name: string) => Promise<void>;
      onConnectionStatusUpdate: (callback: (name: string) => void) => void;
      onConnectionsUpdated: (callback: (connections: ConnectionInfo[]) => void) => void;
      listConnections: () => Promise<ConnectionInfo[]>;
      getConnection: (name: string) => Promise<ConnectionResult>;
      setActiveConnection: (name: string) => Promise<{ success: boolean; error?: string }>;
      getActiveConnection: () => Promise<ConnectionResult>;
      refreshToken: () => Promise<ConnectionResult>;
    };
  }
}
