import { Check, Copy, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { McpStatusInfo } from "../../platform/desktopBridge";
import { MCP_CLIENTS, type McpClientId, type McpServerState } from "../../shared/agents";
import { Button, cn } from "../../shared/ui";

/** One line on the server's state, with the next step as a button. */
export function McpStatusRow({
  server,
  onOpenSettings,
}: {
  server: McpServerState;
  onOpenSettings(): void;
}) {
  const { status, starting, turnOn } = server;

  let dot = "bg-line-strong";
  let label = "Checking the MCP server…";
  let hint = "";
  let action = null;

  if (status?.error) {
    dot = "bg-danger";
    label = "The MCP server could not start";
    hint = "Settings shows why.";
    action = (
      <Button variant="secondary" size="sm" onClick={onOpenSettings}>
        Open settings
      </Button>
    );
  } else if (status?.running) {
    dot = "bg-brand";
    label = "The MCP server is running";
    hint = "Agents can reach Dyno while it is open.";
    action = (
      <Button variant="secondary" size="sm" onClick={onOpenSettings}>
        Agent settings
      </Button>
    );
  } else if (status) {
    label = "The MCP server is off";
    hint = "One switch turns it on.";
    action = (
      <button
        type="button"
        disabled={starting}
        onClick={() => void turnOn()}
        className="inline-flex items-center justify-center rounded-sm bg-brand px-2.5 py-1 text-xs font-semibold text-brand-fg transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {starting ? "Turning on…" : "Turn on"}
      </button>
    );
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-canvas px-3.5 py-3"
    >
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
      <span className="font-semibold text-fg-strong">{label}</span>
      {hint && <span className="text-xs text-fg-muted">{hint}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

/** The setup for one client at a time, with its real command or config for this machine. */
export function ClientSetup({ status }: { status: McpStatusInfo | null }) {
  const [clientId, setClientId] = useState<McpClientId>("claude-code");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const client = MCP_CLIENTS.find((entry) => entry.id === clientId) ?? MCP_CLIENTS[0];
  const text = status ? client.snippet(status) : "";

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
    <div className="overflow-hidden rounded-md border border-line bg-canvas">
      <div role="group" aria-label="Client" className="flex flex-wrap border-b border-line">
        {MCP_CLIENTS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === clientId}
            onClick={() => setClientId(entry.id)}
            className={cn(
              "-mb-px border-b-2 px-3.5 py-2.5 text-sm",
              entry.id === clientId
                ? "border-brand-text font-semibold text-fg-strong"
                : "border-transparent text-fg-muted hover:text-fg-strong",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="flex items-start gap-3 p-3.5">
        <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs text-fg-strong">
          {text || "Reading the setup for this computer…"}
        </pre>
        <Button
          variant="secondary"
          size="sm"
          disabled={!text}
          aria-label={`Copy ${client.label} setup`}
          onClick={() => void copy()}
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="border-t border-line px-3.5 py-2 text-xs text-fg-muted">{client.hint}</p>
    </div>
  );
}

const PLAN = [
  <>
    Create the global choice <code className="font-mono text-xs text-fg-strong">new_priority</code> with 3 options
  </>,
  <>
    Add the column <code className="font-mono text-xs text-fg-strong">new_priority</code> to Case
  </>,
  <>Add the field to the Case main form, General tab</>,
  <>Publish Case</>,
];

/**
 * A picture of how an agent change runs: the request, then the plan Dyno asks about. It is an
 * illustration, so nothing in it is a control.
 */
export function ApprovalExample() {
  return (
    <figure className="m-0 flex flex-col gap-3.5" aria-label="Example: an agent asks for a change and Dyno shows the plan first">
      <div className="max-w-[86%] self-end rounded-[14px] rounded-br-sm bg-raised px-4 py-3 text-sm text-fg-strong">
        <div className="mb-1 text-2xs font-semibold text-fg-muted">You, in Claude Code</div>
        Add a Priority choice to Case with Low, Normal and High, and put it on the main form.
      </div>

      <div className="overflow-hidden rounded-lg border border-line-strong bg-canvas shadow-xl">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
          <ShieldCheck size={18} strokeWidth={1.8} className="text-brand-text" aria-hidden="true" />
          <span className="font-semibold text-fg-strong">Claude Code wants to change Contoso · Dev</span>
        </div>
        <ol className="m-0 flex list-decimal flex-col gap-2 py-3.5 pl-10 pr-4 text-sm text-fg">
          {PLAN.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
        <p className="m-0 px-4 text-xs text-fg-muted">
          Goes into an unmanaged solution. Nothing runs until you approve.
        </p>
        <div aria-hidden="true" className="flex justify-end gap-2.5 px-4 py-3.5">
          <span className="rounded-sm border border-line-strong bg-raised px-4 py-2 text-sm font-medium text-fg-strong">
            Deny
          </span>
          <span className="rounded-sm bg-brand px-4 py-2 text-sm font-semibold text-brand-fg">Approve 4 steps</span>
        </div>
      </div>
    </figure>
  );
}
