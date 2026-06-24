import { memo } from "react";
import Tab from "./TabHeader";
import { useTabs } from "../../context/TabContext";
import { TOOL_REGISTRY } from "../../tools/registry";
import type { TabData } from "../../common/types/tab-data.interface";

const TabContent = memo(({ tab }: { tab: TabData }) => {
  const def = TOOL_REGISTRY[tab.toolId];
  const Tool = def?.component;
  return Tool ? <Tool /> : <>{tab.content}</>;
});
TabContent.displayName = "TabContent";

function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabs();

  return (
    <>
      <div className="flex bg-(--color-bg-darker)">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            title={tab.title}
            active={tab.id === activeTabId}
            onClick={() => setActiveTab(tab.id)}
            onClose={() => closeTab(tab.id)}
          />
        ))}
      </div>
      <div className="flex-1 flex flex-col overflow-hidden bg-(--color-bg-dark)">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={
                isActive ? "flex flex-1 flex-col min-h-0" : "hidden"
              }
            >
              <TabContent tab={tab} />
            </div>
          );
        })}
      </div>
    </>
  );
}

export default TabBar;
