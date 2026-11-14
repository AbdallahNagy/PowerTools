import { useMemo, useState } from "react";
import { Settings } from "lucide-react";

import { useTabs } from "../tabs/useTabs";
import { useToolRegistry } from "../community-tools/useToolRegistry";
import ConnectionFooter from "./ConnectionFooter";
import { filterSidebarItems } from "./sidebarSearch";
import { Badge, Input, Tooltip } from "../../shared/ui";
import { isCommunityIcon } from "./isCommunityIcon";
import { ToolIcon } from "./ToolIcon";
import ToolContextMenu from "./ToolContextMenu";
import { useSettings } from "../settings/SettingsContext";

interface ActivityBarProps {
  /** A narrow strip of icons: tools, the connection, and Settings. Names show at once on hover. */
  collapsed?: boolean;
}

/** Marks the tool the active tab belongs to. */
function ActiveMark() {
  return <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 bg-accent-text" />;
}

const ActivityBar = ({ collapsed = false }: ActivityBarProps) => {
  const { tabs, activeTabId, openTool } = useTabs();
  const { activityBarTools } = useToolRegistry();
  const { openSettings } = useSettings();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{
    toolId: string;
    x: number;
    y: number;
  } | null>(null);
  const menuTool = activityBarTools.find((tool) => tool.id === menu?.toolId);
  const activeToolId = tabs.find((tab) => tab.id === activeTabId)?.toolId;
  const tools = useMemo(
    () => (collapsed ? activityBarTools : filterSidebarItems(activityBarTools, query)),
    [activityBarTools, collapsed, query],
  );

  const contextMenu =
    menu && menuTool ? (
      <ToolContextMenu
        x={menu.x}
        y={menu.y}
        toolTitle={menuTool.title}
        onOpen={() => openTool(menuTool.id)}
        onOpenWithConnection={(connectionId) => openTool(menuTool.id, { connectionId })}
        onClose={() => setMenu(null)}
      />
    ) : null;

  if (collapsed) {
    return (
      <nav
        aria-label="Tools"
        data-collapsed=""
        className="flex h-full w-11 shrink-0 select-none flex-col border-r border-line bg-surface"
      >
        <div className="rail-scroll flex flex-1 flex-col overflow-y-auto overflow-x-hidden py-1">
          {tools.map((tool) => (
            <Tooltip
              key={tool.id}
              side="right"
              delay={0}
              content={
                <span className="flex items-center gap-2">
                  {tool.title}
                  {tool.source === "local" ? <Badge tone="neutral">Local</Badge> : null}
                </span>
              }
            >
              <button
                type="button"
                aria-label={tool.tooltip || tool.title}
                aria-current={tool.id === activeToolId ? "true" : undefined}
                className={`relative flex h-9 w-full shrink-0 items-center justify-center hover:bg-hover hover:text-fg-strong ${
                  tool.id === activeToolId ? "text-fg-strong" : "text-fg"
                }`}
                onClick={() => openTool(tool.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ toolId: tool.id, x: event.clientX, y: event.clientY });
                }}
              >
                {tool.id === activeToolId ? <ActiveMark /> : null}
                <ToolIcon src={tool.icon} untrusted={isCommunityIcon(tool)} />
              </button>
            </Tooltip>
          ))}
        </div>
        {contextMenu}
        <ConnectionFooter compact />
        <Tooltip
          side="right"
          delay={0}
          content={
            <span className="flex items-center gap-2">
              Settings
              <kbd className="font-mono text-2xs text-fg-muted">Ctrl+,</kbd>
            </span>
          }
        >
          <button
            type="button"
            aria-label="Settings"
            className="flex h-9 w-full shrink-0 items-center justify-center text-fg-muted hover:bg-hover hover:text-fg-strong"
            onClick={() => openSettings()}
          >
            <Settings size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </Tooltip>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Tools"
      className="h-full w-full bg-surface flex flex-col select-none border-r border-line"
    >
      <div className="p-2">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools"
          aria-label="Search tools"
          className="bg-raised"
        />
      </div>

      <div className="flex-1 overflow-auto px-1 pb-2">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            title={tool.tooltip || tool.title}
            aria-label={tool.tooltip || tool.title}
            aria-current={tool.id === activeToolId ? "true" : undefined}
            className={`relative mb-0.5 flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-hover hover:text-fg-strong ${
              tool.id === activeToolId ? "text-fg-strong" : "text-fg"
            }`}
            onClick={() => openTool(tool.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ toolId: tool.id, x: event.clientX, y: event.clientY });
            }}
          >
            {tool.id === activeToolId ? <ActiveMark /> : null}
            <ToolIcon src={tool.icon} untrusted={isCommunityIcon(tool)} />
            <span className="min-w-0 flex-1 truncate">{tool.title}</span>
            {tool.source === "local" ? <Badge tone="neutral">Local</Badge> : null}
          </button>
        ))}

        {tools.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-fg-muted">
            No matching tools
          </p>
        )}
      </div>
      {contextMenu}
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1">
          <ConnectionFooter />
        </div>
        {/* Same frame and hover as the connection button beside it. */}
        <div className="flex shrink-0 border-t border-line p-1">
          <button
            type="button"
            title="Settings (Ctrl+,)"
            aria-label="Settings"
            className="flex items-center justify-center px-2 py-1.5 text-fg-muted hover:bg-hover hover:text-fg-strong"
            onClick={() => openSettings()}
          >
            <Settings size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
  );
};

export default ActivityBar;
