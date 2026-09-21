import { useMemo, useState } from "react";

import ConnectIcon from "../../assets/icons/connect-icon.svg";
import { useTabs } from "../../context/useTabs";
import { useConnections } from "../../shared/connections";
import { ACTIVITY_BAR_TOOLS } from "../../tools/registry";
import { filterSidebarItems, matchesSidebarSearch } from "./sidebarSearch";

const CONNECT_ITEM = { title: "Connect", tooltip: "connect" };

const ActivityBar = () => {
  const { openTool } = useTabs();
  const { createConnectionWindow } = useConnections();
  const [query, setQuery] = useState("");
  const tools = useMemo(
    () => filterSidebarItems(ACTIVITY_BAR_TOOLS, query),
    [query],
  );
  const showConnect = matchesSidebarSearch(CONNECT_ITEM, query);
  const hasMatches = showConnect || tools.length > 0;

  return (
    <nav
      aria-label="Tools"
      className="h-full w-full bg-[var(--color-bg-darker)] flex flex-col select-none border-r border-[var(--color-border-dark)]"
    >
      <div className="p-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools"
          aria-label="Search tools"
          className="w-full px-2 py-1.5 text-sm bg-[var(--color-bg-light)] text-[var(--color-text-gray)] placeholder:text-[var(--color-text-dark-gray)] border border-[var(--color-border-dark)] rounded-sm focus:outline-none focus:border-[var(--color-primary)]"
        />
      </div>

      <div className="flex-1 overflow-auto px-1 pb-2">
        {showConnect && (
          <button
            type="button"
            title="connect"
            aria-label="connect"
            className="mb-0.5 flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-[var(--color-text-gray)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-white)]"
            onClick={() => createConnectionWindow()}
          >
            <img
              src={ConnectIcon}
              alt=""
              className="h-5 w-5 object-cover brightness-0 invert opacity-80"
            />
            <span className="truncate">Connect</span>
          </button>
        )}

        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            title={tool.tooltip || tool.title}
            aria-label={tool.tooltip || tool.title}
            className="mb-0.5 flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-[var(--color-text-gray)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-white)]"
            onClick={() => openTool(tool.id)}
          >
            <img
              src={tool.icon}
              alt=""
              className="h-5 w-5 brightness-0 invert opacity-80"
            />
            <span className="truncate">{tool.title}</span>
          </button>
        ))}

        {!hasMatches && (
          <p className="px-2 py-1.5 text-sm text-[var(--color-text-dark-gray)]">
            No matching tools
          </p>
        )}
      </div>
    </nav>
  );
};

export default ActivityBar;
