import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { McpStatusInfo, McpToolInfo } from "../../../platform/desktopBridge";
import { Badge, EmptyState, SearchInput, Switch } from "../../../shared/ui";
import { SettingsGroup } from "./SettingRow";

const EFFECTS: Record<McpToolInfo["effect"], { label: string; tone: "neutral" | "ok" | "warn" | "danger" }> = {
  read: { label: "Read", tone: "ok" },
  change: { label: "Changes", tone: "warn" },
  destructive: { label: "Destructive", tone: "danger" },
  varies: { label: "Varies", tone: "neutral" },
};

function matches(tool: McpToolInfo, query: string): boolean {
  if (!query) return true;
  const text = `${tool.name} ${tool.title} ${tool.description} ${tool.group}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

interface McpToolsListProps {
  groups: McpStatusInfo["groups"];
  tools: McpToolInfo[];
  busy: boolean;
  onGroupChange(group: string, enabled: boolean): void;
  onToolChange(name: string, enabled: boolean): void;
}

/** Tool groups, each with its tools. A tool is offered to agents only when it and its group are on. */
export function McpToolsList({ groups, tools, busy, onGroupChange, onToolChange }: McpToolsListProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const visible = useMemo(() => tools.filter((tool) => matches(tool, query.trim())), [tools, query]);

  return (
    <SettingsGroup
      title="Tools"
      description="Turn a group or a single tool off to stop offering it to agents. Connected agents are told right away."
    >
      <div className="p-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Search tools" aria-label="Search agent tools" />
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {groups.map((entry) => {
          const groupTools = visible.filter((tool) => tool.group === entry.group);
          if (query && groupTools.length === 0) return null;
          const allInGroup = tools.filter((tool) => tool.group === entry.group);
          const on = allInGroup.filter((tool) => tool.enabled).length;
          const open = query ? true : expanded[entry.group] === true;
          return (
            <li key={entry.group} className="flex flex-col">
              <div className="flex items-center gap-2 py-2 pl-3 pr-4">
                <button
                  type="button"
                  className="rounded-sm p-0.5 text-fg-muted hover:bg-hover hover:text-fg-strong"
                  aria-expanded={open}
                  aria-label={`${open ? "Hide" : "Show"} ${entry.group} tools`}
                  onClick={() => setExpanded((current) => ({ ...current, [entry.group]: !open }))}
                >
                  {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                </button>
                <span className="flex-1 font-mono text-sm text-fg-strong">{entry.group}</span>
                <span className="text-xs text-fg-muted">
                  {entry.enabled ? `${on} of ${entry.tools} on` : "Group off"}
                </span>
                <Switch
                  checked={entry.enabled}
                  disabled={busy}
                  onChange={(next) => onGroupChange(entry.group, next)}
                  aria-label={`${entry.group} tools`}
                />
              </div>
              {open ? (
                <ul className="flex flex-col border-t border-line bg-canvas">
                  {groupTools.map((tool) => (
                    <li key={tool.name} className="flex items-center gap-4 py-2 pl-10 pr-4">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-fg-strong">{tool.title}</span>
                          <span className="font-mono text-xs text-fg-muted">{tool.name}</span>
                          <Badge tone={EFFECTS[tool.effect].tone}>{EFFECTS[tool.effect].label}</Badge>
                        </div>
                        <p className="text-xs text-fg-muted">{tool.description}</p>
                      </div>
                      {/* Shows what agents get: a tool of a switched-off group is off, whatever its own setting. */}
                      <Switch
                        size="sm"
                        checked={entry.enabled && tool.enabled}
                        disabled={busy || !entry.enabled}
                        onChange={(next) => onToolChange(tool.name, next)}
                        aria-label={`${tool.name} tool`}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      {query && visible.length === 0 ? <EmptyState title="No matching tools" description="Try another word." /> : null}
    </SettingsGroup>
  );
}
