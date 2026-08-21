import { createContext, type ReactNode } from "react";

export interface StatusItem {
  id: string;
  content: ReactNode;
}

export interface StatusActionsContextValue {
  /** Register or update a status bar item. Call clearStatus on unmount. */
  setStatus: (id: string, content: ReactNode) => void;
  /** Remove the item registered under `id`. Call this on component unmount. */
  clearStatus: (id: string) => void;
}

export interface StatusBarContextValue extends StatusActionsContextValue {
  items: StatusItem[];
}

export const StatusActionsContext = createContext<StatusActionsContextValue | undefined>(
  undefined,
);
export const StatusItemsContext = createContext<readonly StatusItem[] | undefined>(undefined);

// Compatibility context for useStatusBar. New consumers should use the
// purpose-specific read or write API instead.
export const StatusContext = createContext<StatusBarContextValue | undefined>(undefined);
