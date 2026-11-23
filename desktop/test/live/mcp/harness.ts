/**
 * Shared code for the opt-in MCP live tests and agent evals (desktop/docs/mcp-tool-architecture.md, "Making sure it
 * works"). They run against dedicated sandboxes, one online and one on-premises, through a running Dyno app,
 * never production. The pure functions here are unit-tested in test/electron/mcp/liveHarness.test.ts.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/** The repository's evals/mcp folder. */
export const EVALS_DIR = resolve(import.meta.dirname, "..", "..", "..", "..", "evals", "mcp");

export interface Sandbox {
  /** "online" or "onprem": the label results are grouped by. */
  name: string;
  kind: "online" | "onpremise";
  /** The display name of the saved Dyno connection for this sandbox. */
  connection: string;
}

export interface LiveConfig {
  sandboxes: Sandbox[];
  /** Dyno's discovery file. Default: %APPDATA%\Dyno\mcp-endpoint.json, or the Power Tools folder of an older install. */
  endpointFile?: string;
  /** Dyno's activity log folder, read to count approvals. Default: next to the endpoint file. */
  activityDir?: string;
  /** The Claude Code command for evals. Default "claude". */
  claudeCommand?: string;
  /** An MCP config file for Claude Code that adds the Dyno connector as "powertools". */
  claudeMcpConfig?: string;
}

export function defaultEndpointFile(env: NodeJS.ProcessEnv = process.env): string {
  const appData = env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  // The app keeps an older install's "Power Tools" folder; see src/electron/userDataFolder.ts.
  const folder = !existsSync(join(appData, "Dyno")) && existsSync(join(appData, "Power Tools")) ? "Power Tools" : "Dyno";
  return join(appData, folder, "mcp-endpoint.json");
}

/** Reads and checks the sandbox config. Answers why it is unusable instead of throwing. */
export function parseLiveConfig(raw: unknown): { config?: LiveConfig; problem?: string } {
  const value = raw as Partial<LiveConfig> | null;
  if (!value || !Array.isArray(value.sandboxes) || value.sandboxes.length === 0) {
    return { problem: "sandboxes.json needs a non-empty \"sandboxes\" list" };
  }
  for (const sandbox of value.sandboxes) {
    if (typeof sandbox?.name !== "string" || typeof sandbox.connection !== "string") {
      return { problem: "each sandbox needs \"name\" and \"connection\"" };
    }
    if (sandbox.kind !== "online" && sandbox.kind !== "onpremise") {
      return { problem: `sandbox "${sandbox.name}" needs "kind": "online" or "onpremise"` };
    }
  }
  return { config: value as LiveConfig };
}

/**
 * The config from POWERTOOLS_LIVE_CONFIG or evals/mcp/sandboxes.json. Null when there is none, so the suites skip
 * with a message instead of failing on machines without sandboxes.
 */
export function loadLiveConfig(env: NodeJS.ProcessEnv = process.env): { config?: LiveConfig; problem?: string } {
  const path = env.POWERTOOLS_LIVE_CONFIG ?? join(EVALS_DIR, "sandboxes.json");
  if (!existsSync(path)) return { problem: `no sandbox config at ${path}; copy evals/mcp/sandboxes.example.json` };
  return parseLiveConfig(JSON.parse(readFileSync(path, "utf-8")));
}

/** Connects to the running Dyno MCP server as a plain MCP client. */
export async function connect(config: LiveConfig): Promise<Client> {
  const file = config.endpointFile ?? defaultEndpointFile();
  if (!existsSync(file)) throw new Error(`Dyno is not serving MCP: ${file} is missing. Start the app and turn on the MCP server.`);
  const { port, token } = JSON.parse(readFileSync(file, "utf-8")) as { port: number; token: string };
  const client = new Client({ name: "powertools-live-tests", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

/**
 * The shape of a value: keys and types, never values. Two results of the same tool on an online and an
 * on-premises sandbox must have the same shape; that is the parity check. Arrays take the union of their items.
 */
export function shapeOf(value: unknown): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const items = value.map(shapeOf).map((s) => JSON.stringify(s));
    return [...new Set(items)].sort().map((s) => JSON.parse(s) as unknown);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((key) => [key, shapeOf((value as Record<string, unknown>)[key])]),
    );
  }
  return typeof value;
}

/** Differences between two shapes as readable paths. Empty means the two results have the same shape. */
export function shapeDifferences(a: unknown, b: unknown, path = "$"): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) {
    return [`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    // An empty list on one side says nothing about item shape.
    if (a.length === 0 || b.length === 0) return [];
    return shapeDifferences(a[0], b[0], `${path}[]`);
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].sort().flatMap((key) => {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    if (!(key in ra)) return [`${path}.${key}: only on the second`];
    if (!(key in rb)) return [`${path}.${key}: only on the first`];
    return shapeDifferences(ra[key], rb[key], `${path}.${key}`);
  });
}

// ── Eval scenarios ───────────────────────────────────────────────────────────

/** A query run through the MCP server after the agent finishes. Never judged by a model. */
export interface ScenarioCheck {
  description: string;
  tool: string;
  arguments: Record<string, unknown>;
  /** Dotted path into structuredContent, for example "records.length" or "outcome". */
  path: string;
  equals?: unknown;
  atLeast?: number;
  exists?: boolean;
}

export interface Scenario {
  id: string;
  description: string;
  /** The prompt; "{connection}" is replaced by the sandbox's connection name. */
  prompt: string;
  /** Sandbox names to run on. Default: all. */
  sandboxes?: string[];
  /** Tool calls that set the starting state, run before the agent. */
  setup?: Array<{ tool: string; arguments: Record<string, unknown> }>;
  checks: ScenarioCheck[];
  /** Tool calls that put the sandbox back, run after the checks even when they fail. */
  cleanup?: Array<{ tool: string; arguments: Record<string, unknown> }>;
  /** Negative scenarios: tools the agent must not call. */
  mustNotCall?: string[];
  /** The agent must have asked the user (an approval was shown) at least once. */
  mustAsk?: boolean;
  /** The phase that makes this scenario runnable; later phases are skipped. */
  phase: number;
}

export function parseScenario(raw: unknown, file = "scenario"): Scenario {
  const s = raw as Partial<Scenario> | null;
  const fail = (why: string): never => {
    throw new Error(`${file}: ${why}`);
  };
  if (!s || typeof s !== "object") fail("not an object");
  if (typeof s!.id !== "string" || !/^[a-z0-9-]+$/.test(s!.id)) fail("\"id\" must be kebab-case");
  if (typeof s!.prompt !== "string" || !s!.prompt) fail("\"prompt\" is required");
  if (typeof s!.phase !== "number") fail("\"phase\" is required");
  if (!Array.isArray(s!.checks)) fail("\"checks\" must be a list");
  for (const check of s!.checks!) {
    if (typeof check.tool !== "string" || typeof check.path !== "string") fail("each check needs \"tool\" and \"path\"");
    if (check.equals === undefined && check.atLeast === undefined && check.exists === undefined) {
      fail(`check "${check.description}" needs equals, atLeast or exists`);
    }
  }
  return s as Scenario;
}

export function loadScenarios(dir = join(EVALS_DIR, "scenarios")): Scenario[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => parseScenario(JSON.parse(readFileSync(join(dir, name), "utf-8")), name));
}

export function valueAt(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current === null || current === undefined) return undefined;
    if (key === "length" && (Array.isArray(current) || typeof current === "string")) return current.length;
    return (current as Record<string, unknown>)[key];
  }, value);
}

/** Null when the check passes; otherwise why it failed. */
export function evaluateCheck(check: ScenarioCheck, structured: unknown): string | null {
  const actual = valueAt(structured, check.path);
  if (check.exists !== undefined && (actual !== undefined) !== check.exists) {
    return `${check.description}: ${check.path} ${check.exists ? "is missing" : "exists"}`;
  }
  if (check.equals !== undefined && JSON.stringify(actual) !== JSON.stringify(check.equals)) {
    return `${check.description}: ${check.path} is ${JSON.stringify(actual)}, expected ${JSON.stringify(check.equals)}`;
  }
  if (check.atLeast !== undefined && !(typeof actual === "number" && actual >= check.atLeast)) {
    return `${check.description}: ${check.path} is ${JSON.stringify(actual)}, expected at least ${check.atLeast}`;
  }
  return null;
}

/** Fills "{connection}" anywhere in a prompt or in tool arguments. */
export function withConnection<T>(value: T, connection: string): T {
  return JSON.parse(JSON.stringify(value).split("{connection}").join(connection.replace(/"/g, '\\"'))) as T;
}

// ── Transcript metrics ───────────────────────────────────────────────────────

export interface TranscriptMetrics {
  toolCalls: string[];
  toolErrors: number;
  finished: boolean;
  costUsd?: number;
}

/**
 * Reads the stream-json transcript of `claude -p --output-format stream-json --verbose`: which Dyno tools the
 * agent called, how many results were errors, and whether it finished.
 */
export function readTranscript(lines: string): TranscriptMetrics {
  const metrics: TranscriptMetrics = { toolCalls: [], toolErrors: 0, finished: false };
  for (const line of lines.split("\n")) {
    if (!line.trim()) continue;
    let event: { type?: string; message?: { content?: unknown }; is_error?: boolean; subtype?: string; total_cost_usd?: number };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      continue;
    }
    const content = Array.isArray(event.message?.content) ? (event.message!.content as Array<Record<string, unknown>>) : [];
    for (const part of content) {
      if (event.type === "assistant" && part.type === "tool_use" && typeof part.name === "string") {
        metrics.toolCalls.push(part.name.replace(/^mcp__powertools__/, ""));
      }
      if (event.type === "user" && part.type === "tool_result" && part.is_error === true) metrics.toolErrors += 1;
    }
    if (event.type === "result") {
      metrics.finished = event.subtype === "success";
      if (typeof event.total_cost_usd === "number") metrics.costUsd = event.total_cost_usd;
    }
  }
  return metrics;
}

/** Counts approvals Dyno asked the user for between two times, from its activity log lines. */
export function countApprovals(logLines: string, from: Date, to: Date): number {
  return logLines
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as { time?: string; approval?: string };
      } catch {
        return {};
      }
    })
    .filter((entry) => {
      const time = entry.time ? Date.parse(entry.time) : NaN;
      return time >= from.getTime() && time <= to.getTime() && ["allowed", "denied", "timed-out"].includes(entry.approval ?? "");
    }).length;
}
