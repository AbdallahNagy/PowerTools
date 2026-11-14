import { useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";

import type { McpStatusInfo } from "../../../platform/desktopBridge";
import { Alert, Badge, Button, EmptyState, cn } from "../../../shared/ui";
import type { AgentsState } from "../../agents/useAgents";
import { McpToolsList } from "./McpToolsList";
import { SettingSwitchRow, SettingsGroup } from "./SettingRow";

function statusOf(status: McpStatusInfo | null): { label: string; tone: "neutral" | "ok" | "danger" } {
  if (status?.error) return { label: `Could not start: ${status.error}`, tone: "danger" };
  if (status?.running) return { label: "Running", tone: "ok" };
  return { label: "Off", tone: "neutral" };
}

/** Both snippets use the same launch, so a client config and the Claude Code command cannot disagree. */
function claudeCodeCommand(status: McpStatusInfo): string {
  return `claude mcp add --scope user powertools -- ${status.connectorCommand}`;
}

function clientConfigJson(status: McpStatusInfo): string {
  return JSON.stringify(
    { mcpServers: { powertools: { command: status.connector.command, args: status.connector.args } } },
    null,
    2,
  );
}

function vsCodeConfigJson(status: McpStatusInfo): string {
  return JSON.stringify(
    { servers: { powertools: { type: "stdio", command: status.connector.command, args: status.connector.args } } },
    null,
    2,
  );
}

type ClientId = "claude-code" | "claude-desktop" | "vs-code";

const CLIENTS: Array<{ id: ClientId; label: string; hint: string; snippet(status: McpStatusInfo): string }> = [
  { id: "claude-code", label: "Claude Code", hint: "Run this in a terminal.", snippet: claudeCodeCommand },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    hint: "Add this to claude_desktop_config.json, then restart Claude Desktop.",
    snippet: clientConfigJson,
  },
  { id: "vs-code", label: "VS Code", hint: "Save this as .vscode/mcp.json in your workspace.", snippet: vsCodeConfigJson },
];

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
    <div className="relative">
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-sm border border-line bg-canvas p-3 pr-24 font-mono text-xs text-fg">
        {text}
      </pre>
      <Button
        variant="secondary"
        size="sm"
        className="absolute right-2 top-2"
        aria-label={`Copy ${label}`}
        onClick={() => void copy()}
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/** One client's setup at a time, so the page is not three snippets long. */
function ConnectClient({ status }: { status: McpStatusInfo }) {
  const [clientId, setClientId] = useState<ClientId>("claude-code");
  const client = CLIENTS.find((entry) => entry.id === clientId) ?? CLIENTS[0];

  return (
    <SettingsGroup title="Connect a client" description="Pick your agent, then copy its setup.">
      <div className="flex flex-col gap-3 p-4">
        <div role="group" aria-label="Client" className="flex w-fit gap-0.5 rounded-md border border-line bg-canvas p-0.5">
          {CLIENTS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={entry.id === clientId}
              onClick={() => setClientId(entry.id)}
              className={cn(
                "rounded-sm px-3 py-1 text-xs",
                entry.id === clientId ? "bg-raised text-fg-strong" : "text-fg-muted hover:text-fg-strong",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <Snippet label={client.label} text={client.snippet(status)} />
        <p className="text-xs text-fg-muted">{client.hint}</p>
      </div>
    </SettingsGroup>
  );
}

/** The MCP server: switch, client setup, tools, and recent activity. */
export function AgentsSection({ agents }: { agents: AgentsState }) {
  const { status, busy, error, setEnabled, setGroup, setTool, refresh } = agents;
  const state = statusOf(status);
  const enabled = status?.running === true || (status?.enabled === true && !status.error);

  return (
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <SettingsGroup title="MCP server" hideTitle>
        <SettingSwitchRow
          label="Let AI agents use Power Tools (MCP server)"
          description="Off by default. Agents work through your own sign-in. Changes need your approval unless a connection allows them under Agent permissions; destructive actions always ask."
          checked={enabled}
          disabled={busy || status === null}
          // Until the first read returns there is no state to show; a switch drawn "off" would flip a moment later.
          loading={status === null && !error}
          onChange={(next) => void setEnabled(next)}
          aside={<Badge tone={state.tone}>{state.label}</Badge>}
        />
      </SettingsGroup>

      {status ? <ConnectClient status={status} /> : null}

      {status ? (
        <McpToolsList
          groups={status.groups}
          tools={status.tools ?? []}
          busy={busy}
          onGroupChange={(group, next) => void setGroup(group, next)}
          onToolChange={(name, next) => void setTool(name, next)}
        />
      ) : null}

      <SettingsGroup
        title="Recent activity"
        action={
          <Button variant="ghost" size="sm" disabled={busy} aria-label="Refresh activity" onClick={() => void refresh()}>
            <RefreshCw size={14} aria-hidden="true" />
            Refresh
          </Button>
        }
      >
        {status && status.recent.length > 0 ? (
          <ul className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto text-xs">
            {status.recent.slice(0, 50).map((entry, index) => (
              <li key={`${entry.time}-${index}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                <span className="text-fg-muted">{new Date(entry.time).toLocaleString()}</span>
                <span className="font-mono text-fg-strong">{entry.tool}</span>
                <span className="min-w-0 flex-1 truncate text-fg-muted">{entry.connection ?? "No connection"}</span>
                <Badge tone={entry.outcome === "ok" ? "ok" : "danger"}>
                  {entry.outcome === "ok" ? "OK" : (entry.code ?? "Error")}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No agent activity yet" description="Calls made by agents appear here." />
        )}
      </SettingsGroup>
    </>
  );
}
