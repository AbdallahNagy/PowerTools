import { createContext } from "react";
import type { DesktopOperationResult } from "../../platform/desktopBridge";
import type { ConnectionInfo } from "./types";

export interface ConnectionsContextValue {
  connections: ConnectionInfo[];
  activeConnectionId: string | null;
  isActiveConnectionLoaded: boolean;
  createConnectionWindow: () => Promise<void>;
  /** Opens the Manage connections window, optionally with a connection selected. */
  openConnectionManager: (id?: string | null) => Promise<void>;
  deleteConnection: (id: string) => Promise<DesktopOperationResult>;
  setActiveConnection: (id: string) => Promise<DesktopOperationResult>;
}

export const ConnectionsContext = createContext<ConnectionsContextValue | null>(null);
