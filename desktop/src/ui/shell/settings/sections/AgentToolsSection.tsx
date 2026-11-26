import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

import type { McpActivityEntry, McpToolInfo } from "../../../platform/desktopBridge";
import { Alert, EmptyState, SearchInput, Spinner, Switch, cn } from "../../../shared/ui";
import type { AgentsState } from "../../agents/useAgents";
import { EffectTag, FilterSegments } from "./agentToolDisplay";
import { groupDisplay } from "./agentTools";

type EffectFilter = "all" | "read" | "change" | "destructive";

const FILTERS: ReadonlyArray<{ id: EffectFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "read", label: "Read" },
  { id: "change", label: "Change" },
  { id: "destructive", label: "Destructive" },
];

/** What the row says about asking first, from what main decides for each effect. */
function asksFirst(tool: McpToolInfo): string | undefined {
  if (tool.effect === "destructive") return "Always asks you first.";
  if (tool.effect !== "change") return undefined;
  // A per-call tool's plan or message can be destructive, and then it asks whatever the connection allows.
  return tool.perCall
    ? "Asks you first unless the connection allows changes. A call that removes or replaces something always asks."
    : "Asks you first unless the connection allows changes.";
}

function matchesQuery(tool: McpToolInfo, query: string): boolean {
  if (!query) return true;
  const text = `${tool.name} ${tool.title} ${tool.description} ${tool.group} ${groupDisplay(tool.group).label}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

/** Tool descriptions are written for agents; the first sentence is the part a person needs. */
function firstSentence(text: string): string {
  const end = text.search(/\.(\s|$)/);
  return end === -1 ? text : text.slice(0, end + 1);
}

function matchesEffect(tool: McpToolInfo, filter: EffectFilter): boolean {
  return filter === "all" || tool.effect === filter;
}

/** "Used 5 min ago", "Used today at 14:05", "Used yesterday", or "Used on 12 Nov". */
function lastUsedLabel(time: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - time.getTime()) / 60_000);
  if (minutes < 1) return "Used just now";
  if (minutes < 60) return `Used ${minutes} min ago`;
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((day(now) - day(time)) / 86_400_000);
  if (days === 0) return `Used today at ${time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1) return "Used yesterday";
  return `Used on ${time.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

/** The newest call of each tool in the recent activity. */
function lastUsedByTool(recent: McpActivityEntry[]): Map<string, Date> {
  const last = new Map<string, Date>();
  for (const entry of recent) {
    const time = new Date(entry.time);
    const seen = last.get(entry.tool);
    if (!seen || time > seen) last.set(entry.tool, time);
  }
  return last;
}

/** Tool groups, each with its tools. A tool is offered to agents only when it and its group are on. */
export function AgentToolsSection({ agents }: { agents: AgentsState }) {
  const { status, busy, error, setGroup, setTool } = agents;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EffectFilter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const tools = useMemo(() => status?.tools ?? [], [status]);
  const lastUsed = useMemo(() => lastUsedByTool(status?.recent ?? []), [status]);
  const now = new Date();

  if (!status) {
    return error ? (
      <Alert tone="danger">{error}</Alert>
    ) : (
      <div role="status" aria-label="Loading agent tools" className="flex justify-center py-8">
        <Spinner size={18} />
      </div>
    );
  }

  const trimmed = query.trim();
  const narrowed = trimmed !== "" || filter !== "all";
  const visible = tools.filter((tool) => matchesQuery(tool, trimmed) && matchesEffect(tool, filter));
  const offered = tools.filter((tool) => tool.enabled && status.groups.find((g) => g.group === tool.group)?.enabled).length;
  const counts = FILTERS.map((option) => ({
    ...option,
    count: tools.filter((tool) => matchesQuery(tool, trimmed) && matchesEffect(tool, option.id)).length,
  }));

  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!status.running ? (
        <Alert tone="info">The MCP server is off. These choices apply when you turn it on under MCP server.</Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <FilterSegments<EffectFilter> label="Show tools that" value={filter} options={counts} onChange={setFilter} />
          <div className="min-w-44 flex-1">
            <SearchInput value={query} onChange={setQuery} placeholder="Search tools" aria-label="Search agent tools" />
          </div>
        </div>
        <p className="text-xs text-fg-muted">
          <span className="text-fg-strong">
            {offered} of {tools.length}
          </span>{" "}
          tools offered to agents
        </p>
      </div>

      <div className="flex flex-col divide-y divide-line">
        {status.groups.map((entry) => {
          const groupTools = visible.filter((tool) => tool.group === entry.group);
          if (narrowed && groupTools.length === 0) return null;
          const display = groupDisplay(entry.group);
          const allInGroup = tools.filter((tool) => tool.group === entry.group);
          const on = allInGroup.filter((tool) => tool.enabled).length;
          const open = narrowed || expanded[entry.group] === true;
          return (
            <section key={entry.group} aria-label={display.label} className="flex flex-col">
              <div className="sticky top-0 z-10 flex items-center gap-6 bg-surface py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h4 className={cn("text-sm font-normal", entry.enabled ? "text-fg-strong" : "text-fg-muted")}>
                    {display.label}
                  </h4>
                  <p className="text-xs text-fg-muted">
                    {display.description}{" "}
                    {entry.enabled ? `${on} of ${entry.tools} on.` : "Group off."}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {narrowed ? null : (
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={`${open ? "Hide" : "Show"} ${display.label} tools`}
                      onClick={() => setExpanded((current) => ({ ...current, [entry.group]: !open }))}
                      className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs text-fg-muted hover:bg-hover hover:text-fg-strong"
                    >
                      {entry.tools} {entry.tools === 1 ? "tool" : "tools"}
                      <ChevronRight
                        size={12}
                        aria-hidden="true"
                        className={cn("transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")}
                      />
                    </button>
                  )}
                  <Switch
                    checked={entry.enabled}
                    disabled={busy}
                    onChange={(next) => void setGroup(entry.group, next)}
                    aria-label={`${display.label} tools`}
                  />
                </div>
              </div>
              {open ? (
                <ul className="flex flex-col pb-2 pl-4">
                  {groupTools.map((tool) => {
                    // Shows what agents get: a tool of a switched-off group is off, whatever its own setting.
                    const live = entry.enabled && tool.enabled;
                    const used = lastUsed.get(tool.name);
                    return (
                      <li key={tool.name} className="flex items-center gap-6 py-2">
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex items-center gap-2">
                            <span className={cn("text-sm", live ? "text-fg" : "text-fg-muted")} title={tool.name}>
                              {tool.title}
                            </span>
                            <EffectTag effect={tool.effect} />
                          </span>
                          <p className="text-xs text-fg-muted">
                            <span title={tool.description}>
                              {firstSentence(tool.description)}
                              {asksFirst(tool) ? ` ${asksFirst(tool)}` : ""}
                            </span>
                            {used ? <span> · {lastUsedLabel(used, now)}</span> : null}
                          </p>
                        </div>
                        <Switch
                          size="sm"
                          checked={live}
                          disabled={busy || !entry.enabled}
                          onChange={(next) => void setTool(tool.name, next)}
                          aria-label={`${tool.title} (${tool.name})`}
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
      {narrowed && visible.length === 0 ? (
        <EmptyState title="No matching tools" description="Try another word or show all tools." />
      ) : null}
    </>
  );
}
