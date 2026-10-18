import { memo, useContext, useEffect, useRef, useState } from "react";
import Tab from "./TabHeader";
import TabContextMenu from "./TabContextMenu";
import EmptyWorkspace from "../layout/EmptyWorkspace";
import { useTabs } from "./useTabs";
import ToolHost from "../tool-runtime/ToolHost";
import { TOOL_REGISTRY } from "../../tools/registry";
import type { TabData } from "./types";
import { ConnectionsContext } from "../../shared/connections/ConnectionsContext";

const TabContent = memo(({ tab }: { tab: TabData }) => {
  const def = TOOL_REGISTRY[tab.toolId];
  return def ? <ToolHost tab={tab} definition={def} /> : <>{tab.content}</>;
});
TabContent.displayName = "TabContent";

function TabBar() {
  const {
    tabs,
    activeTabId,
    setActiveTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    setTabConnection,
  } = useTabs();
  const stripRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);
  const menuTab = tabs.find((tab) => tab.id === menu?.tabId);
  // The tab strip also renders in tests and screens without connections.
  const connections = useContext(ConnectionsContext)?.connections ?? [];
  const connectionsById = new Map(connections.map((connection) => [connection.id, connection]));

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    // A wheel over the tab strip scrolls it sideways, as in VS Code.
    const scrollSideways = (event: WheelEvent) => {
      if (event.deltaY === 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (strip.scrollWidth <= strip.clientWidth) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    };
    strip.addEventListener("wheel", scrollSideways, { passive: false });
    return () => strip.removeEventListener("wheel", scrollSideways);
  }, []);

  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabs.length]);

  return (
    <>
      <div
        ref={stripRef}
        className="tab-strip flex min-w-0 shrink-0 overflow-x-auto overflow-y-hidden bg-surface"
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            title={tab.title}
            connectionLabel={tab.connectionId ? connectionsById.get(tab.connectionId)?.displayName ?? null : null}
            production={tab.connectionId ? connectionsById.get(tab.connectionId)?.environmentKind === "production" : false}
            active={tab.id === activeTabId}
            onClick={() => setActiveTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });
            }}
          />
        ))}
      </div>
      {menu && menuTab ? (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          connectionId={menuTab.connectionId ?? null}
          canChangeConnection={menuTab.toolId !== "welcome"}
          canCloseOthers={tabs.length > 1}
          onSelect={(connectionId) => setTabConnection(menu.tabId, connectionId)}
          onCloseTab={() => closeTab(menu.tabId)}
          onCloseOthers={() => closeOtherTabs(menu.tabId)}
          onCloseAll={closeAllTabs}
          onClose={() => setMenu(null)}
        />
      ) : null}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-canvas">
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
