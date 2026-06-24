import { createContext, useContext, useState, type ReactNode } from "react";
import type { TabData } from "../common/types/tab-data.interface";
import { TABS } from "../common/fake data/tabs";
import { TOOL_REGISTRY } from "../tools/registry";

interface TabContextType {
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

const TabContext = createContext<TabContextType | undefined>(undefined);

export const TabProvider = ({ children }: { children: ReactNode }) => {
  const [tabs, setTabs] = useState<TabData[]>(TABS);
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id || "");

  const openTool = (toolId: string) => {
    const def = TOOL_REGISTRY[toolId];
    if (!def) {
      console.warn(`openTool: unknown toolId "${toolId}"`);
      return;
    }

    const sameTool = tabs.filter((t) => t.toolId === toolId);

    if (def.allowMultipleInstances === false && sameTool.length > 0) {
      setActiveTabId(sameTool[0].id);
      return;
    }

    const instanceId = `${toolId}-${Date.now()}`;
    const title =
      sameTool.length === 0 ? def.title : `${def.title} ${sameTool.length + 1}`;

    setTabs((prev) => [...prev, { id: instanceId, toolId, title }]);
    setActiveTabId(instanceId);
  };

  const addTab = (tab: TabData) => {
    setTabs((prev) =>
      prev.find((t) => t.id === tab.id) ? prev : [...prev, tab],
    );
    setActiveTabId(tab.id);
  };

  const closeTab = (tabId: string) => {
    const newTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(newTabs);

    if (activeTabId === tabId) {
      const index = tabs.findIndex((tab) => tab.id === tabId);
      const newActiveTab = newTabs[index - 1] || newTabs[index] || newTabs[0];
      if (newActiveTab) {
        setActiveTabId(newActiveTab.id);
      } else {
        setActiveTabId("");
      }
    }
  };

  const setActiveTab = (tabId: string) => {
    setActiveTabId(tabId);
  };

  return (
    <TabContext.Provider
      value={{ tabs, activeTabId, openTool, addTab, closeTab, setActiveTab }}
    >
      {children}
    </TabContext.Provider>
  );
};

export const useTabs = () => {
  const context = useContext(TabContext);
  if (context === undefined) {
    throw new Error("useTabs must be used within a TabProvider");
  }
  return context;
};
