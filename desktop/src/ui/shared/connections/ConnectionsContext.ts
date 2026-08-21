import { createContext } from "react";
import type { DesktopOperationResult } from "../../platform/desktopBridge";
import type { ConnectionInfo } from "./types";

export interface ConnectionsContextValue {
  connections: ConnectionInfo[];
  activeConnectionName: string | null;
  isActiveConnectionLoaded: boolean;
  createConnectionWindow: () => Promise<void>;
  deleteConnection: (name: string) => Promise<DesktopOperationResult>;
  setActiveConnection: (name: string) => Promise<DesktopOperationResult>;
}

export const ConnectionsContext = createContext<ConnectionsContextValue | null>(null);
