import { useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";

import type { McpStatusInfo } from "../../platform/desktopBridge";
import { Alert, Badge, Button, Checkbox, EmptyState, Modal } from "../../shared/ui";
import { useAgents } from "./useAgents";

function statusOf(status: McpStatusInfo | null): { label: string; tone: "neutral" | "ok" | "danger" } {
  if (status?.error) return { label: `Could not start: ${status.error}`, tone: "danger" };
  if (status?.running) return { label: "Running", tone: "ok" };
  return { label: "Off", tone: "neutral" };
}

/** Both snippets use the same launch, so a client config and the Claude Code command cannot disagree. */
function claudeCodeCommand(status: McpStatusInfo): string {
  return `claude mcp add powertools -- ${status.connectorCommand}`;
}

function clientConfigJson(status: McpStatusInfo): string {
  return JSON.stringify(
    { mcpServers: { powertools: { command: status.connector.command, args: status.connector.args } } },
    null,
    2,
  );
}

function Snippet({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg-strong">{label}</span>
        <Button variant="ghost" size="sm" aria-label={`Copy ${label}`} onClick={() => void copy()}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-sm border border-line bg-canvas p-2 font-mono text-xs text-fg">
        {text}
      </pre>
    </div>
  );
}

interface AgentsDialogProps {
  open: boolean;
  onClose(): void;
}

export function AgentsDialog({ open, onClose }: AgentsDialogProps) {
  const { status, busy, error, setEnabled, setGroup, refresh } = useAgents(open);
  const state = statusOf(status);
  const enabled = status?.running === true || (status?.enabled === true && !status.error);

  return (
    <Modal
      open={open}
      title="Agents (MCP)"
      description="Let AI agents such as Claude Code use your Power Tools connections."
      onClose={onClose}
      widthClass="max-w-2xl"
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-fg-strong">
          <Checkbox
            checked={enabled}
            disabled={busy || status === null}
            onChange={(next) => void setEnabled(next)}
            aria-label="Let AI agents use Power Tools (MCP server)"
          />
          Let AI agents use Power Tools (MCP server)
        </label>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      <p className="text-xs text-fg-muted">
        Off by default. Agents work through your own sign-in and can only read metadata and records for now.
      </p>

      {status ? (
        <section className="flex flex-col gap-3" aria-label="Connect a client">
          <h3 className="text-sm font-medium text-fg-strong">Connect a client</h3>
          <Snippet label="Claude Code" text={claudeCodeCommand(status)} />
          <Snippet label="Claude Desktop and VS Code" text={clientConfigJson(status)} />
        </section>
      ) : null}

      {status ? (
        <section className="flex flex-col gap-2" aria-label="Tool groups">
          <h3 className="text-sm font-medium text-fg-strong">Tool groups</h3>
          <p className="text-xs text-fg-muted">Turn a group off to stop offering its tools to agents. Connected agents are told right away.</p>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {status.groups.map((entry) => (
              <li key={entry.group}>
                <label className="flex items-center gap-2 text-sm text-fg">
                  <Checkbox
                    checked={entry.enabled}
                    disabled={busy}
                    onChange={(next) => void setGroup(entry.group, next)}
                    aria-label={`${entry.group} tools`}
                  />
                  <span className="font-mono">{entry.group}</span>
                  <span className="text-xs text-fg-muted">
                    {entry.tools} {entry.tools === 1 ? "tool" : "tools"}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2" aria-label="Recent activity">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-fg-strong">Recent activity</h3>
          <Button variant="ghost" size="sm" disabled={busy} aria-label="Refresh activity" onClick={() => void refresh()}>
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </Button>
        </div>
        {status && status.recent.length > 0 ? (
          <ul className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto border border-line text-xs">
            {status.recent.slice(0, 50).map((entry, index) => (
              <li key={`${entry.time}-${index}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
                <span className="text-fg-muted">{new Date(entry.time).toLocaleString()}</span>
                <span className="font-mono text-fg-strong">{entry.tool}</span>
                <span className="min-w-0 truncate text-fg-muted">{entry.connection ?? "No connection"}</span>
                <Badge tone={entry.outcome === "ok" ? "ok" : "danger"}>
                  {entry.outcome === "ok" ? "OK" : (entry.code ?? "Error")}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No agent activity yet" description="Calls made by agents appear here." />
        )}
      </section>
    </Modal>
  );
}
