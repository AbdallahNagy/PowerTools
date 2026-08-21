import { createContext, type ReactNode } from "react";

export interface StatusItem {
  id: string;
  content: ReactNode;
}

export interface StatusBarContextValue {
  items: StatusItem[];
  /** Register or update a status bar item. Call clearStatus on unmount. */
  setStatus: (id: string, content: ReactNode) => void;
  /** Remove the item registered under `id`. Call this on component unmount. */
  clearStatus: (id: string) => void;
}

export const StatusContext = createContext<StatusBarContextValue | undefined>(undefined);
