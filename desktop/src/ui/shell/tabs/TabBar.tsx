import { memo, useState } from "react";
import Tab from "./TabHeader";
import TabConnectionMenu from "./TabConnectionMenu";
import EmptyWorkspace from "../layout/EmptyWorkspace";
import { useTabs } from "./useTabs";
import ToolHost from "../tool-runtime/ToolHost";
import { TOOL_REGISTRY } from "../../tools/registry";
import type { TabData } from "./types";

const TabContent = memo(({ tab }: { tab: TabData }) => {
  const def = TOOL_REGISTRY[tab.toolId];
  return def ? <ToolHost tab={tab} definition={def} /> : <>{tab.content}</>;
});
TabContent.displayName = "TabContent";

function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, setTabConnection } = useTabs();
  const [menu, setMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);
  const menuTab = tabs.find((tab) => tab.id === menu?.tabId);

  return (
    <>
      <div className="flex bg-surface">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            title={tab.title}
            connectionName={tab.connectionName}
            active={tab.id === activeTabId}
            onClick={() => setActiveTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            onContextMenu={
              tab.toolId === "welcome"
                ? undefined
                : (event) => {
                    event.preventDefault();
                    setMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });
                  }
            }
          />
        ))}
      </div>
      {menu && menuTab && menuTab.toolId !== "welcome" ? (
        <TabConnectionMenu
          x={menu.x}
          y={menu.y}
          connectionName={menuTab.connectionName ?? null}
          onSelect={(connectionName) => setTabConnection(menu.tabId, connectionName)}
          onClose={() => setMenu(null)}
        />
      ) : null}
      <div className="flex-1 flex flex-col overflow-hidden bg-canvas">
        {tabs.length === 0 ? (
          <EmptyWorkspace />
        ) : (
          tabs.map((tab) => {
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
          })
        )}
      </div>
    </>
  );
}

export default TabBar;
