/// <reference types="vite/client" />

interface Window {
  electron: {
    getStaticData: () => void;
    createConnectionWindow: () => Promise<void>;
    saveConnectionData: (data: any) => Promise<void>;
    saveConnectionName: (name: string) => Promise<void>;
    onConnectionStatusUpdate: (callback: (name: string) => void) => void;
  };
}
