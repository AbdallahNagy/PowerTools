import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import type { McpLegacySetup, McpStatusInfo } from "../../../platform/desktopBridge";
import { Alert, Badge, Button, cn } from "../../../shared/ui";
import type { AgentsState } from "../../agents/useAgents";
import { useSettings } from "../SettingsContext";
import { relativeTime } from "./agentTools";
import { SettingRow, SettingSwitchRow, SettingsGroup } from "./SettingRow";

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
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-canvas p-3 pr-24 font-mono text-xs text-fg">
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

/** What to run or paste instead of a setup that still starts PowerTools.API.exe. */
function legacyFix(setup: McpLegacySetup, status: McpStatusInfo): { text: string; hint: string } {
  switch (setup.client) {
    case "Claude Code": {
      const remove =
        setup.scope && setup.scope !== "user"
          ? `cd "${setup.scope}"\nclaude mcp remove --scope local ${setup.server}`
          : `claude mcp remove --scope user ${setup.server}`;
      return { text: `${remove}\n${claudeCodeCommand(status)}`, hint: "Run these in a terminal, then restart Claude Code." };
    }
    case "Claude Desktop":
      return {
        text: clientConfigJson(status),
        hint: `Replace the "${setup.server}" entry in ${setup.configPath}, then restart Claude Desktop.`,
      };
    case "VS Code":
      return { text: vsCodeConfigJson(status), hint: `Replace the "${setup.server}" entry in ${setup.configPath}.` };
  }
}

/**
 * Setups made before the separate connector start PowerTools.API.exe from the install folder. The client keeps it
 * running, so Power Tools cannot install updates. The app never edits these files; it shows what to change.
 */
function LegacySetupWarning({ status }: { status: McpStatusInfo }) {
  const setups = status.legacySetups ?? [];
  if (setups.length === 0) return null;
  return (
    <Alert tone="warn" title="Update your agent setup so Power Tools can update">
      <p>
        These setups start the old connector inside the Power Tools install folder. While the agent runs, it keeps
        that file locked and updates cannot install. Switch them to the new connector:
      </p>
      <ul className="mt-3 flex flex-col gap-4">
        {setups.map((setup) => {
          const fix = legacyFix(setup, status);
          const where = setup.scope && setup.scope !== "user" ? `${setup.configPath}, project ${setup.scope}` : setup.configPath;
          return (
            <li key={`${setup.client}|${setup.configPath}|${setup.scope ?? ""}|${setup.server}`} className="flex flex-col gap-2">
              <p className="text-xs">
                <span className="font-medium text-fg-strong">{setup.client}</span>: server "{setup.server}" in {where}
              </p>
              <Snippet label={`${setup.client} fix`} text={fix.text} />
              <p className="text-xs text-fg-muted">{fix.hint}</p>
            </li>
          );
        })}
      </ul>
    </Alert>
  );
}

/** One client's setup at a time, so the page is not three snippets long. */
function ConnectClient({ status }: { status: McpStatusInfo }) {
  const [clientId, setClientId] = useState<ClientId>("claude-code");
  const client = CLIENTS.find((entry) => entry.id === clientId) ?? CLIENTS[0];

  return (
    <SettingsGroup title="Connect a client" description="Pick your agent, then copy its setup.">
      <div className="flex flex-col gap-3 p-4">
        <div role="group" aria-label="Client" className="flex w-fit gap-0.5 rounded-md bg-canvas p-0.5">
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

/** Where the tools and the activity went, with a one-line state of each. */
function MovedPages({ status }: { status: McpStatusInfo }) {
  const { setSection } = useSettings();
  const tools = status.tools ?? [];
  const groupOn = new Map(status.groups.map((entry) => [entry.group, entry.enabled]));
  const offered = tools.filter((tool) => tool.enabled && groupOn.get(tool.group)).length;
  const newest = status.recent.reduce<string | null>((latest, entry) => (!latest || entry.time > latest ? entry.time : latest), null);
  const errors = status.recent.filter((entry) => entry.outcome === "error").length;
  const activity = newest
    ? `Last call ${relativeTime(new Date(newest), new Date()).toLowerCase()}${errors > 0 ? `, ${errors} ${errors === 1 ? "error" : "errors"} recently` : ""}`
    : "No calls yet";

  return (
    <SettingsGroup title="Tools and activity" hideTitle>
      <SettingRow label="Tools offered" description={`${offered} of ${tools.length}, in ${status.groups.length} groups`}>
        <Button variant="secondary" size="sm" onClick={() => setSection("agentTools")}>
          Manage tools
        </Button>
      </SettingRow>
      <SettingRow label="Agent activity" description={activity}>
        <Button variant="secondary" size="sm" onClick={() => setSection("agentActivity")}>
          View activity
        </Button>
      </SettingRow>
    </SettingsGroup>
  );
}

/** The MCP server: switch, client setup, and where to find its tools and activity. */
export function AgentsSection({ agents }: { agents: AgentsState }) {
  const { status, busy, error, setEnabled } = agents;
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

      {status ? <LegacySetupWarning status={status} /> : null}

      {status ? <MovedPages status={status} /> : null}

      {status ? <ConnectClient status={status} /> : null}
    </>
  );
}
