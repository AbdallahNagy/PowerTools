import { memo, useContext, useEffect, useRef, useState } from "react";
import { House } from "lucide-react";
import Tab from "./TabHeader";
import { useTabDrag } from "./useTabDrag";
import { isCommunityIcon } from "../layout/isCommunityIcon";
import { ToolIcon } from "../layout/ToolIcon";
import TabContextMenu from "./TabContextMenu";
import EmptyWorkspace from "../layout/EmptyWorkspace";
import { useTabs } from "./useTabs";
import ToolHost from "../tool-runtime/ToolHost";
import { useToolRegistry } from "../community-tools/useToolRegistry";
import { EmptyState } from "../../shared/ui";
import type { TabData } from "./types";
import { ConnectionsContext } from "../../shared/connections/ConnectionsContext";

const TabContent = memo(({ tab }: { tab: TabData }) => {
  const { toolsById } = useToolRegistry();
  const def = toolsById[tab.toolId];
  if (def) return <ToolHost tab={tab} definition={def} />;
  // A tab with its own content is a static tab. Any other tab lost its tool, for example a removed community tool.
  if (tab.content !== undefined) return <>{tab.content}</>;
  return (
    <EmptyState
      title="This tool is no longer loaded"
      description="Close this tab, or load the tool again from File > Community tools."
    />
  );
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
    moveTab,
    setTabConnection,
  } = useTabs();
  const { toolsById } = useToolRegistry();
  const stripRef = useRef<HTMLDivElement>(null);
  // Pressing a tab selects it, as in VS Code, so its content is already showing when a drag starts.
  const { draggingId, startDrag, swallowDragClick } = useTabDrag({
    stripRef,
    onMove: moveTab,
    onPress: setActiveTab,
  });
  // Tool content stays in one fixed order whatever the strip's order is. Moving a pane in the
  // page would reload a community tool's frame, so reordering tabs must never move one.
  const panes = [...tabs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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

  // Arrow keys move between tabs when one has focus, as in any tab list.
  const focusNeighborTab = (event: React.KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (!(event.target as HTMLElement).matches('[role="tab"]')) return;
    const index = tabs.findIndex((tab) => tab.id === activeTabId);
    const target =
      event.key === "ArrowRight" ? index + 1
      : event.key === "ArrowLeft" ? index - 1
      : event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
      : -1;
    const next = tabs[target];
    if (!next || index < 0) return;
    event.preventDefault();
    setActiveTab(next.id);
    const tabElement = Array.from(
      stripRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? [],
    ).find((element) => element.dataset.tabId === next.id);
    tabElement?.querySelector<HTMLElement>('[role="tab"]')?.focus();
  };

  return (
    <>
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Open tabs"
        onClickCapture={swallowDragClick}
        onKeyDown={focusNeighborTab}
        // The inset line is the strip's bottom edge; the active tab covers it and joins the content below.
        className="tab-strip relative flex min-w-0 shrink-0 overflow-x-auto overflow-y-hidden bg-surface shadow-[inset_0_-1px_0_var(--color-line)]"
      >
        {tabs.map((tab) => {
          const tool = toolsById[tab.toolId];
          const connection = tab.connectionId ? connectionsById.get(tab.connectionId) : undefined;
          return (
            <Tab
              key={tab.id}
              id={tab.id}
              title={tab.title}
              icon={
                tool?.icon ? (
                  <ToolIcon src={tool.icon} untrusted={isCommunityIcon(tool)} className="h-4 w-4" />
                ) : tab.toolId === "welcome" ? (
                  <House size={14} className="shrink-0 opacity-80" aria-hidden="true" />
                ) : null
              }
              connectionLabel={connection?.displayName ?? null}
              production={connection?.environmentKind === "production"}
              active={tab.id === activeTabId}
              dragging={tab.id === draggingId}
              onClick={() => setActiveTab(tab.id)}
              onClose={() => closeTab(tab.id)}
              onPointerDown={(event) => startDrag(tab.id, event)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });
              }}
            />
          );
        })}
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
          panes.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                data-tab-pane={tab.id}
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
