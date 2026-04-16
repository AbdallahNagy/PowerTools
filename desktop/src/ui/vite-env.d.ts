/// <reference types="vite/client" />

interface Window {
  electron: {
    getStaticData: () => void;
    createConnectionWindow: () => Promise<void>;
    saveConnectionData: (data: any) => Promise<{ success: boolean; error?: string }>;
    saveConnectionName: (name: string) => Promise<void>;
    onConnectionStatusUpdate: (callback: (name: string) => void) => void;
    callApi: (endpoint: string) => Promise<{ status?: number; data?: string; error?: string }>;
  };
}
