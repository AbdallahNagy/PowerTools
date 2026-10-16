import { createContext } from "react";

import type { TabData } from "./types";

export interface OpenToolOptions {
  /** Bind the new tab to this connection instead of the active one. */
  connectionName?: string | null;
}

export interface TabContextValue {
  tabs: TabData[];
  activeTabId: string;
  /**
   * Open a tool from the registry as a new tab. Honors
   * `allowMultipleInstances`: when false, activates the existing tab
   * instead of creating another. The new tab binds to the active
   * connection unless `options.connectionName` names another one.
   */
  openTool: (toolId: string, options?: OpenToolOptions) => void;
  /** Add a pre-built tab (used for static tabs like Welcome). */
  addTab: (tab: TabData) => void;
  closeTab: (tabId: string) => void;
  /** Close every tab except `tabId` and activate it. */
  closeOtherTabs: (tabId: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (tabId: string) => void;
  /**
   * Bind one tab to a connection. Does not change the active connection.
   */
  setTabConnection: (tabId: string, connectionName: string | null) => void;
}

export const TabProviderContext = createContext<TabContextValue | undefined>(undefined);
