import { LayoutGrid, Radar } from "lucide-react";
import { useEffect, type CSSProperties, type ReactNode } from "react";

import { desktopBridge } from "../../platform/desktopBridge";
import { useMcpServer } from "../../shared/agents";
import { openToolRequest } from "../../shared/links/openToolRequest";
import { useAgentSettings, useNewConnection, useOpenTool } from "../../shared/workspace";
import { PUBLIC_TOOLS } from "../publicCatalog";
import { TOOL_REGISTRY } from "../registry";
import { DynoWordmark } from "./DynoMark";
import { HeroCycle } from "./HeroCycle";
import { ApprovalExample, ClientSetup, McpStatusRow } from "./McpSection";
import "./welcome.css";

const GITHUB_URL = "https://github.com/AbdallahNagy/Dyno";

/** Tools named on the Tools card; the full list is further down. */
const FEATURED_TOOL_IDS = ["fetchxml-builder", "plugin-registration", "data-migration", "solution-layers-explorer"];

const SAFEGUARDS = [
  { title: "Reads never ask", detail: "Schema, forms, solutions, queries" },
  { title: "Changes ask you first", detail: "Or trust a dev connection" },
  { title: "Deletes always ask", detail: "No setting turns this off" },
  { title: "Online and on-premises", detail: "The same tools on both" },
];

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="m-0 mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-brand-text">{children}</p>;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

/** The tool's own icon, tinted like the activity bar draws it. */
function ToolGlyph({ toolId }: { toolId: string }) {
  const src = TOOL_REGISTRY[toolId]?.icon;
  if (!src) return null;
  const mask = `url("${src}") center / contain no-repeat`;
  const style: CSSProperties = { mask, WebkitMask: mask };
  return <span aria-hidden="true" className="inline-block h-5 w-5 bg-current" style={style} />;
}

const primaryButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-5 text-sm font-semibold text-brand-fg transition-colors hover:bg-brand-hover";
const secondaryButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line-strong bg-raised px-5 text-sm font-medium text-fg-strong transition-colors hover:bg-hover";

export default function WelcomeTab() {
  const openTool = useOpenTool();
  const newConnection = useNewConnection();
  const { settingsOpen, openAgentSettings } = useAgentSettings();
  const server = useMcpServer();
  const { refresh } = server;

  // The server may have been turned on or off in Settings; read it again when Settings closes.
  useEffect(() => {
    if (!settingsOpen) void refresh();
  }, [settingsOpen, refresh]);

  const featured = FEATURED_TOOL_IDS.map((id) => PUBLIC_TOOLS.find((tool) => tool.id === id)).filter(
    (tool) => tool !== undefined,
  );
  const moreCount = PUBLIC_TOOLS.length - featured.length;

  return (
    <div className="h-full overflow-y-auto bg-canvas text-sm text-fg">
      {/* Hero */}
      <section
        className="px-8 pb-14 pt-16"
        style={{
          background:
            "radial-gradient(ellipse 55% 65% at 80% 35%, color-mix(in srgb, var(--color-brand) 10%, transparent) 0%, transparent 70%)",
        }}
      >
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-12">
          <div className="flex min-w-0 flex-[1_1_480px] flex-col items-start gap-5">
            <DynoWordmark />
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/15 px-3 py-1 text-xs font-semibold text-brand-text">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" />
              New: the Dyno MCP server, online and on-premises
            </span>
            <h1 className="m-0 mt-2 max-w-[560px] text-4xl font-semibold leading-tight tracking-tight text-fg-strong">
              The last tool you need for Dataverse.
            </h1>
            <p className="m-0 max-w-[540px] text-base leading-relaxed text-fg">
              You already work across Dataverse, Power Platform and Dynamics 365. Dyno is the piece that completes it:
              modern tools for every day, and an MCP server so your AI agent can do the work with you. Nothing missing,
              so you stay in flow.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <button type="button" className={primaryButton} onClick={newConnection}>
                Connect to an environment
              </button>
              <button type="button" className={secondaryButton} onClick={openAgentSettings}>
                <Radar size={16} strokeWidth={1.8} aria-hidden="true" />
                Set up AI agents
              </button>
            </div>
            <p className="m-0 text-xs text-fg-muted">Free and open source. Runs on your machine with your own sign-in.</p>
          </div>
          <div className="flex min-w-0 flex-[1_1_400px] justify-center">
            <HeroCycle />
          </div>
        </div>
      </section>

      {/* What Dyno does */}
      <section className="px-8 pb-16 pt-6">
        <div className="mx-auto max-w-[1120px]">
          <Eyebrow>What Dyno does</Eyebrow>
          <h2 className="m-0 mb-7 text-2xl font-semibold text-fg-strong">Two ways to work. One place.</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-5">
            <article className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-7">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand/15 text-brand-text">
                  <LayoutGrid size={22} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-muted">1 · Tools</span>
              </div>
              <h3 className="m-0 text-xl font-semibold leading-snug text-fg-strong">
                Dataverse tools that finally feel modern
              </h3>
              <p className="m-0">
                The jobs you do every day, from FetchXML to plug-in steps to solution layers, in clear screens that are quick
                to learn and pleasant to come back to. No old dialogs to dig through.
              </p>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {featured.map((tool) => (
                  <li key={tool.id} className="rounded-md bg-raised px-2.5 py-1 text-xs text-fg">
                    {tool.title}
                  </li>
                ))}
                {moreCount > 0 && (
                  <li className="rounded-md border border-dashed border-line-strong px-2.5 py-1 text-xs text-fg-muted">
                    + {moreCount} more
                  </li>
                )}
              </ul>
              <div className="mt-auto pt-2">
                <button
                  type="button"
                  className="font-semibold text-brand-text hover:text-fg-strong"
                  onClick={() => scrollToSection("welcome-tools")}
                >
                  Browse all tools →
                </button>
              </div>
            </article>

            <article
              className="flex flex-col gap-4 rounded-xl border border-brand/40 p-7"
              style={{
                background:
                  "linear-gradient(160deg, color-mix(in srgb, var(--color-brand) 12%, var(--color-surface)) 0%, var(--color-surface) 60%)",
              }}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand text-brand-fg">
                  <Radar size={22} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-brand-text">2 · MCP server</span>
                <span className="ml-auto rounded-full border border-brand/40 bg-brand/15 px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-brand-text">
                  New
                </span>
              </div>
              <h3 className="m-0 text-xl font-semibold leading-snug text-fg-strong">An MCP server your agent can rely on</h3>
              <p className="m-0">
                Let Claude Code, Claude Desktop or VS Code read and change your environments through Dyno, with your sign-in
                and the connections you already saved. The same tools on Dataverse online and on-premises.
              </p>
              <McpStatusRow server={server} onOpenSettings={openAgentSettings} />
              <div className="mt-auto pt-2">
                <button
                  type="button"
                  className="font-semibold text-brand-text hover:text-fg-strong"
                  onClick={() => scrollToSection("welcome-mcp")}
                >
                  See how it works →
                </button>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Work agentically */}
      <section id="welcome-mcp" className="border-y border-line bg-surface px-8 py-16">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-start gap-12">
          <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-6">
            <div>
              <Eyebrow>Work agentically</Eyebrow>
              <h2 className="m-0 mb-2.5 text-3xl font-semibold leading-tight text-fg-strong">
                Describe the outcome. Approve the plan. Done.
              </h2>
              <p className="m-0 text-base text-fg">
                Your agent says what it wants your environment to look like. Dyno reads the environment, works out exactly
                what has to change, and shows you that plan before anything runs.
              </p>
            </div>
            <ol className="m-0 flex list-none flex-col gap-5 p-0">
              <Step number={1} title="Turn on the server">
                Settings › Agents (MCP). One switch, and it stays on your machine.
              </Step>
              <Step number={2} title="Connect your client">
                <span className="mb-2.5 block">No token in any config file. Copy the setup for your client.</span>
                <ClientSetup status={server.status} />
              </Step>
              <Step number={3} title="Ask for what you want">
                Tables, columns, forms, views, plug-ins, flows, roles, solutions and records. Reads run right away; changes
                wait for you.
              </Step>
            </ol>
          </div>
          <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-3.5">
            <ApprovalExample />
            <ul className="m-0 mt-1.5 grid list-none grid-cols-2 gap-2.5 p-0">
              {SAFEGUARDS.map((item) => (
                <li key={item.title} className="rounded-md border border-line px-3.5 py-3">
                  <div className="font-semibold text-fg-strong">{item.title}</div>
                  <div className="text-xs text-fg-muted">{item.detail}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Tools */}
      <section id="welcome-tools" className="px-8 py-16">
        <div className="mx-auto max-w-[1120px]">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <Eyebrow>Your toolkit</Eyebrow>
              <h2 className="m-0 text-2xl font-semibold text-fg-strong">{PUBLIC_TOOLS.length} tools, one click away</h2>
              <p className="m-0 mt-1.5 text-fg-muted">Each opens in a new tab on your active connection.</p>
            </div>
            <button type="button" className={secondaryButton} onClick={() => void openToolRequest()}>
              Request a tool
            </button>
          </div>
          <div className="grid auto-rows-fr grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
            {PUBLIC_TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                aria-label={`Open ${tool.title}`}
                onClick={() => openTool(tool.id)}
                className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-brand/40 hover:bg-raised"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand-text">
                  <ToolGlyph toolId={tool.id} />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold text-fg-strong">{tool.title}</span>
                  <span className="text-xs text-fg-muted">{tool.summary}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="px-8 pb-14">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface px-7 py-6">
          <div>
            <div className="font-semibold text-fg-strong">Built in the open</div>
            <div className="text-fg-muted">Dyno is open source. Read the code, suggest a tool, or help shape what comes next.</div>
          </div>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-text hover:text-fg-strong"
            onClick={(event) => {
              event.preventDefault();
              void desktopBridge.openExternalUrl(GITHUB_URL);
            }}
          >
            View on GitHub
          </a>
        </div>
      </section>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand-text"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-fg-strong">{title}</div>
        <div className="text-fg-muted">{children}</div>
      </div>
    </li>
  );
}
