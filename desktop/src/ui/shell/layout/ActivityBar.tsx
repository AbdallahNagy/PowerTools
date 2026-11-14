import { useMemo, useState } from "react";
import { Settings } from "lucide-react";

import { useTabs } from "../tabs/useTabs";
import { useToolRegistry } from "../community-tools/useToolRegistry";
import ConnectionFooter from "./ConnectionFooter";
import { filterSidebarItems } from "./sidebarSearch";
import { Badge, Input } from "../../shared/ui";
import { isCommunityIcon } from "./isCommunityIcon";
import { ToolIcon } from "./ToolIcon";
import ToolContextMenu from "./ToolContextMenu";
import { useSettings } from "../settings/SettingsContext";

const ActivityBar = () => {
  const { openTool } = useTabs();
  const { activityBarTools } = useToolRegistry();
  const { openSettings } = useSettings();
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{
    toolId: string;
    x: number;
    y: number;
  } | null>(null);
  const menuTool = activityBarTools.find((tool) => tool.id === menu?.toolId);
  const tools = useMemo(
    () => filterSidebarItems(activityBarTools, query),
    [activityBarTools, query],
  );

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
            className="mb-0.5 flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-fg hover:bg-hover hover:text-fg-strong"
            onClick={() => openTool(tool.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ toolId: tool.id, x: event.clientX, y: event.clientY });
            }}
          >
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
      {menu && menuTool ? (
        <ToolContextMenu
          x={menu.x}
          y={menu.y}
          toolTitle={menuTool.title}
          onOpen={() => openTool(menuTool.id)}
          onOpenWithConnection={(connectionId) =>
            openTool(menuTool.id, { connectionId })
          }
          onClose={() => setMenu(null)}
        />
      ) : null}
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1">
          <ConnectionFooter />
        </div>
        <button
          type="button"
          title="Settings (Ctrl+,)"
          aria-label="Settings"
          className="flex shrink-0 items-center justify-center border-l border-t border-line px-3 text-fg-muted hover:bg-hover hover:text-fg-strong"
          onClick={() => openSettings()}
        >
          <Settings size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
};

export default ActivityBar;
