/**
 * Agent evals: each scenario in evals/mcp/scenarios runs Claude Code headless with the Dyno MCP server, on
 * every sandbox, then checks the sandbox with plain MCP queries (never a model's judgement). Opt-in:
 *   npm run eval:mcp
 * Results go to evals/mcp/results/<time>.json (not committed).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  connect,
  countApprovals,
  defaultEndpointFile,
  EVALS_DIR,
  evaluateCheck,
  loadLiveConfig,
  loadScenarios,
  readTranscript,
  withConnection,
  type TranscriptMetrics,
} from "./harness";

/** Scenarios of later phases are listed but skipped. Raise this as each phase lands. */
const CURRENT_PHASE = Number(process.env.DYNO_EVAL_PHASE ?? 0);

const { config, problem } = loadLiveConfig();
if (problem) console.warn(`[mcp evals] skipped: ${problem}`);

interface RunRecord {
  scenario: string;
  sandbox: string;
  passed: boolean;
  failures: string[];
  metrics: TranscriptMetrics & { approvals: number; seconds: number };
}

const records: RunRecord[] = [];

describe.skipIf(!config)("MCP agent evals", () => {
  let client: Client;

  beforeAll(async () => {
    client = await connect(config!);
  });

  afterAll(async () => {
    await client?.close();
    const dir = join(EVALS_DIR, "results");
    mkdirSync(dir, { recursive: true });
    const passed = records.filter((r) => r.passed).length;
    writeFileSync(
      join(dir, `${new Date().toISOString().replace(/:/g, "-")}.json`),
      JSON.stringify({ phase: CURRENT_PHASE, passed, total: records.length, runs: records }, null, 2),
    );
  });

  const scenarios = config ? loadScenarios() : [];
  const runs = scenarios.flatMap((scenario) =>
    (config?.sandboxes ?? [])
      .filter((sandbox) => !scenario.sandboxes || scenario.sandboxes.includes(sandbox.name))
      .map((sandbox) => ({ scenario, sandbox })),
  );

  it.each(runs.map((run) => [`${run.scenario.id} on ${run.sandbox.name}`, run] as const))("%s", async (_label, { scenario, sandbox }) => {
    if (scenario.phase > CURRENT_PHASE) return; // listed so the report shows what is still to come

    const call = (tool: string, args: Record<string, unknown>) =>
      client.callTool({ name: tool, arguments: withConnection({ ...args, connection: "{connection}" }, sandbox.connection) });

    for (const step of scenario.setup ?? []) await call(step.tool, step.arguments);

    const started = new Date();
    const prompt = withConnection(scenario.prompt, sandbox.connection);
    const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--allowedTools", "mcp__dyno__*"];
    if (config!.claudeMcpConfig) args.push("--mcp-config", config!.claudeMcpConfig, "--strict-mcp-config");
    const run = spawnSync(config!.claudeCommand ?? "claude", args, { encoding: "utf-8", timeout: 15 * 60_000, shell: process.platform === "win32" });
    const ended = new Date();
    const metrics = readTranscript(run.stdout ?? "");

    const failures: string[] = [];
    try {
      if (!metrics.finished) failures.push(`the agent did not finish (exit ${run.status}): ${(run.stderr ?? "").slice(0, 500)}`);
      for (const tool of scenario.mustNotCall ?? []) {
        if (metrics.toolCalls.includes(tool)) failures.push(`called ${tool}, which this scenario forbids`);
      }
      const approvals = countApprovals(readActivity(config!.activityDir), started, ended);
      if (scenario.mustAsk && approvals === 0) failures.push("no approval was asked");
      for (const check of scenario.checks) {
        const result = await call(check.tool, check.arguments);
        const failure = evaluateCheck(check, result.structuredContent);
        if (failure) failures.push(failure);
      }
      records.push({
        scenario: scenario.id,
        sandbox: sandbox.name,
        passed: failures.length === 0,
        failures,
        metrics: { ...metrics, approvals, seconds: (ended.getTime() - started.getTime()) / 1000 },
      });
    } finally {
      for (const step of scenario.cleanup ?? []) await call(step.tool, step.arguments).catch(() => undefined);
    }

    expect(failures).toEqual([]);
  });
});

function readActivity(dir: string | undefined): string {
  const folder = dir ?? join(dirname(defaultEndpointFile()), "mcp-activity");
  if (!existsSync(folder)) return "";
  return readdirSync(folder)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => readFileSync(join(folder, name), "utf-8"))
    .join("\n");
}
