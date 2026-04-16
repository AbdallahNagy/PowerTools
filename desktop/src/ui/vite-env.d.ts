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

declare global {
  interface Window {
    electron: {
      createConnectionWindow: () => Promise<void>;
      saveConnectionData: (
        data: unknown
      ) => Promise<{ success: boolean; error?: string }>;
      saveConnectionName: (name: string) => Promise<void>;
      onConnectionStatusUpdate: (callback: (name: string) => void) => void;
      getActiveConnection: () => Promise<ConnectionResult>;
      refreshToken: () => Promise<ConnectionResult>;
    };
  }
}
