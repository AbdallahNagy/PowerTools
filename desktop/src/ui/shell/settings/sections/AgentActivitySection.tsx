import { useEffect, useMemo, useState } from "react";
import { Ban, CircleAlert, RefreshCw } from "lucide-react";

import type { McpActivityEntry, McpToolInfo } from "../../../platform/desktopBridge";
import { Alert, Button, EmptyState, SearchInput, Spinner } from "../../../shared/ui";
import type { AgentsState } from "../../agents/useAgents";
import { EffectTile, FilterSegments } from "./agentToolDisplay";
import { relativeTime, toolIcon } from "./agentTools";

type ActivityFilter = "all" | "changes" | "errors";

/** How each approval outcome reads under a call. Calls that needed no approval say nothing. */
const APPROVALS: Record<McpActivityEntry["approval"], { label: string; tone: "accent" | "danger" } | null> = {
  "not-needed": null,
  auto: { label: "Allowed without asking", tone: "accent" },
  allowed: { label: "You approved", tone: "accent" },
  denied: { label: "Declined", tone: "danger" },
  "timed-out": { label: "Approval timed out", tone: "danger" },
  unavailable: { label: "Could not ask for approval", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

const REFUSED = new Set<McpActivityEntry["approval"]>(["denied", "timed-out", "unavailable", "cancelled"]);

function matchesFilter(entry: McpActivityEntry, filter: ActivityFilter): boolean {
  if (filter === "errors") return entry.outcome === "error";
  if (filter === "changes") return entry.effect !== "read";
  return true;
}

function matchesQuery(entry: McpActivityEntry, title: string, query: string): boolean {
  if (!query) return true;
  const text = `${entry.tool} ${title} ${entry.summary} ${entry.connection ?? ""} ${entry.client ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

/** The summary starts with the tool's name; what follows is what it acted on, such as a table. */
function targetOf(entry: McpActivityEntry): string {
  return entry.summary.startsWith(entry.tool) ? entry.summary.slice(entry.tool.length).trim() : entry.summary;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(date: Date, now: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const that = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((today - that) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function countLabel(entries: McpActivityEntry[]): string {
  const errors = entries.filter((entry) => entry.outcome === "error").length;
  const calls = `${entries.length} ${entries.length === 1 ? "call" : "calls"}`;
  return errors === 0 ? calls : `${calls}, ${errors} ${errors === 1 ? "error" : "errors"}`;
}

/** Every agent call the activity log keeps, as a feed grouped by day. */
export function AgentActivitySection({ agents }: { agents: AgentsState }) {
  const { status, busy, error, refresh } = agents;
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [query, setQuery] = useState("");
  const tools = useMemo(() => new Map<string, McpToolInfo>((status?.tools ?? []).map((tool) => [tool.name, tool])), [status]);
  const now = new Date();

  // Opening the tab from another agent tab would otherwise show the activity as it was then.
  useEffect(() => {
    if (status) void refresh();
    // Only on opening the tab: a later status must not trigger another read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!status) {
    return error ? (
      <Alert tone="danger">{error}</Alert>
    ) : (
      <div role="status" aria-label="Loading agent activity" className="flex justify-center py-8">
        <Spinner size={18} />
      </div>
    );
  }

  const trimmed = query.trim();
  const titleOf = (entry: McpActivityEntry) => tools.get(entry.tool)?.title ?? entry.tool;
  const searched = status.recent.filter((entry) => matchesQuery(entry, titleOf(entry), trimmed));
  const visible = searched
    .filter((entry) => matchesFilter(entry, filter))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const counts = (["all", "changes", "errors"] as const).map((id) => ({
    id,
    label: id === "all" ? "All" : id === "changes" ? "Changes" : "Errors",
    count: searched.filter((entry) => matchesFilter(entry, id)).length,
  }));

  const days: Array<{ key: string; label: string; entries: McpActivityEntry[] }> = [];
  for (const entry of visible) {
    const time = new Date(entry.time);
    const key = dayKey(time);
    const last = days[days.length - 1];
    if (last?.key === key) last.entries.push(entry);
    else days.push({ key, label: dayLabel(time, now), entries: [entry] });
  }

  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-wrap items-center gap-2.5">
        <FilterSegments<ActivityFilter> label="Show calls" value={filter} options={counts} onChange={setFilter} />
        <div className="min-w-44 flex-1">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by tool, connection or agent"
            aria-label="Search agent activity"
          />
        </div>
        <Button variant="ghost" size="sm" disabled={busy} aria-label="Refresh activity" onClick={() => void refresh()}>
          <RefreshCw size={14} aria-hidden="true" />
        </Button>
      </div>

      {status.recent.length === 0 ? (
        <EmptyState title="No agent activity yet" description="Calls made by agents appear here." />
      ) : visible.length === 0 ? (
        <EmptyState title="No matching calls" description="Try another word or show all calls." />
      ) : (
        <div className="-mx-2.5 flex flex-col">
          {days.map((day) => (
            <section key={day.key} aria-label={day.label} className="flex flex-col">
              <div className="sticky top-0 z-10 flex justify-between bg-canvas px-2.5 pb-2 pt-4 text-xs text-fg-muted">
                <h4 className="font-medium text-fg">{day.label}</h4>
                <span>{countLabel(day.entries)}</span>
              </div>
              <ul className="flex flex-col gap-1">
                {day.entries.map((entry, index) => {
                  const time = new Date(entry.time);
                  const failed = entry.outcome === "error";
                  const approval = APPROVALS[entry.approval];
                  const target = targetOf(entry);
                  const icon = !failed ? toolIcon(entry.tool, entry.effect) : REFUSED.has(entry.approval) ? Ban : CircleAlert;
                  return (
                    <li
                      key={`${entry.time}-${index}`}
                      className="flex items-start gap-3 rounded-lg px-2.5 py-2 hover:bg-surface"
                    >
                      <EffectTile icon={icon} effect={entry.effect} error={failed} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <p className="truncate text-sm text-fg-strong">
                          {titleOf(entry)}
                          {target ? <span className="ml-1.5 font-mono text-xs text-fg">{target}</span> : null}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-fg-muted">
                          {failed && !REFUSED.has(entry.approval) ? (
                            <span className="rounded-sm bg-danger-soft px-1.5 py-px font-medium text-danger">
                              {entry.code ?? "Error"}
                            </span>
                          ) : null}
                          {approval ? (
                            <span className={approval.tone === "danger" ? "text-danger" : "text-accent-text"}>{approval.label}</span>
                          ) : null}
                          <span>{entry.connection ?? "No connection"}</span>
                          {entry.client ? <span>{entry.client}</span> : null}
                          <span className="font-mono text-[11px]">{entry.tool}</span>
                        </p>
                      </div>
                      <time
                        dateTime={entry.time}
                        title={time.toLocaleString()}
                        className="whitespace-nowrap pt-0.5 text-xs tabular-nums text-fg-muted"
                      >
                        {relativeTime(time, now)}
                      </time>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-fg-muted">Shows the most recent calls. The full log is in the logs folder, under Updates &amp; About.</p>
    </>
  );
}
