import { createContext, useContext, useState, type ReactNode } from "react";
import type { TabData } from "../common/types/tab-data.interface";
import { TABS } from "../common/fake data/tabs";

interface TabContextType {
  tabs: TabData[];
  activeTabId: string;
  addTab: (tab: TabData) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
}

const TabContext = createContext<TabContextType | undefined>(undefined);

export const TabProvider = ({ children }: { children: ReactNode }) => {
  const [tabs, setTabs] = useState<TabData[]>(TABS);
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id || "");

  const addTab = (tab: TabData) => {
    if (!tabs.find((t) => t.id === tab.id)) {
      setTabs([...tabs, tab]);
    }
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
      value={{ tabs, activeTabId, addTab, closeTab, setActiveTab }}
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
