import { createContext } from "react";

import type { TabData } from "../common/types/tab-data.interface";

export interface TabContextValue {
  tabs: TabData[];
  activeTabId: string;
  /**
   * Open a tool from the registry as a new tab. Honors
   * `allowMultipleInstances`: when false, activates the existing tab
   * instead of creating another.
   */
  openTool: (toolId: string) => void;
  /** Add a pre-built tab (used for static tabs like Welcome). */
  addTab: (tab: TabData) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
}

export const TabProviderContext = createContext<TabContextValue | undefined>(undefined);
