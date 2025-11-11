import { useState } from "react";
import type { TabData } from "../../common/types/tab-data.interface";
import Tab from "./TabHeader";
import { TABS } from "../../common/fake data/tabs";

function TabBar() {
  const [tabs, setTabs] = useState<TabData[]>(TABS);

  const [activeTabId, setActiveTabId] = useState(tabs[0].id);

  const closeTab = (tabId: string) => {
    setTabs(tabs.filter((tab) => tab.id !== tabId));

    if (activeTabId === tabId) {
      // Switch to the previous tab or the first available tab
      const index = tabs.findIndex((tab) => tab.id === tabId);
      const newActiveTab = tabs[index - 1] || tabs[index + 1];

      if (newActiveTab) setActiveTabId(newActiveTab.id);
    }
  };

  return (
    <>
      <div className="flex bg-(--gray-color)">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            title={tab.title}
            active={tab.id === activeTabId}
            onClick={() => setActiveTabId(tab.id)}
            onClose={() => closeTab(tab.id)}
          />
        ))}
      </div>
      <div className="flex-1 bg-[#1e1e1e]">
        {tabs.find((tab) => tab.id === activeTabId)?.content}
      </div>
    </>
  );
}

export default TabBar;
