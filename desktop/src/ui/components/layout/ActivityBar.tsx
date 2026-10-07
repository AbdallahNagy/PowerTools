import { useMemo, useState } from "react";

import { useTabs } from "../../context/useTabs";
import { ACTIVITY_BAR_TOOLS } from "../../tools/registry";
import ConnectionFooter from "./ConnectionFooter";
import { filterSidebarItems } from "./sidebarSearch";
import { Input } from "../../shared/ui";
import { ToolIcon } from "./ToolIcon";

const ActivityBar = () => {
  const { openTool } = useTabs();
  const [query, setQuery] = useState("");
  const tools = useMemo(
    () => filterSidebarItems(ACTIVITY_BAR_TOOLS, query),
    [query],
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
          >
            <ToolIcon src={tool.icon} />
            <span className="truncate">{tool.title}</span>
          </button>
        ))}

        {tools.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-fg-muted">
            No matching tools
          </p>
        )}
      </div>
      <ConnectionFooter />
    </nav>
  );
};

export default ActivityBar;
