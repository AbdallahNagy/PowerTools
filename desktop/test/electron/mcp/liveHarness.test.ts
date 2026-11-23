import { describe, expect, it } from "vitest";
import {
  countApprovals,
  evaluateCheck,
  loadScenarios,
  parseLiveConfig,
  parseScenario,
  readTranscript,
  shapeDifferences,
  shapeOf,
  withConnection,
} from "../../live/mcp/harness";

describe("live harness: parity", () => {
  it("compares keys and types, never values", () => {
    const online = { outcome: "applied", steps: [{ op: "createColumn", status: "done" }], published: ["con_a"] };
    const onprem = { outcome: "failed", steps: [{ op: "x", status: "failed" }], published: [] };
    expect(shapeDifferences(shapeOf(online), shapeOf(onprem))).toEqual([]);
  });

  it("names the paths where shapes differ", () => {
    const online = { table: { logicalName: "account", isCustom: false } };
    const onprem = { table: { logicalName: "account", isCustom: "false", extra: 1 } };
    expect(shapeDifferences(shapeOf(online), shapeOf(onprem))).toEqual([
      "$.table.extra: only on the second",
      '$.table.isCustom: "boolean" vs "string"',
    ]);
  });
});

describe("live harness: config and scenarios", () => {
  it("explains an unusable sandbox config", () => {
    expect(parseLiveConfig({}).problem).toMatch(/sandboxes/);
    expect(parseLiveConfig({ sandboxes: [{ name: "a", connection: "A", kind: "cloud" }] }).problem).toMatch(/kind/);
    expect(parseLiveConfig({ sandboxes: [{ name: "a", connection: "A", kind: "online" }] }).config).toBeDefined();
  });

  it("every checked-in scenario is valid", () => {
    const scenarios = loadScenarios();
    expect(scenarios.length).toBeGreaterThan(0);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
    expect(scenarios.some((s) => s.phase === 0)).toBe(true);
  });

  it("refuses a scenario with a check that asserts nothing", () => {
    expect(() =>
      parseScenario({ id: "x", prompt: "p", phase: 0, checks: [{ description: "d", tool: "t", arguments: {}, path: "a" }] }),
    ).toThrow(/needs equals, atLeast or exists/);
  });

  it("fills the sandbox connection into prompts and arguments", () => {
    expect(withConnection({ prompt: 'use "{connection}"' }, 'Dev "A"')).toEqual({ prompt: 'use "Dev "A""' });
  });

  it("evaluates checks against structured content", () => {
    const content = { records: [{ name: "a" }], table: { logicalName: "account" } };
    const base = { description: "d", tool: "t", arguments: {} };
    expect(evaluateCheck({ ...base, path: "records.length", equals: 1 }, content)).toBeNull();
    expect(evaluateCheck({ ...base, path: "records.length", atLeast: 2 }, content)).toMatch(/expected at least 2/);
    expect(evaluateCheck({ ...base, path: "table.logicalName", equals: "contact" }, content)).toMatch(/expected "contact"/);
    expect(evaluateCheck({ ...base, path: "missing", exists: false }, content)).toBeNull();
  });
});

describe("live harness: transcripts and approvals", () => {
  it("counts Dyno tool calls and errors from stream-json", () => {
    const lines = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__powertools__connections_list" }] } }),
      JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", is_error: true }] } }),
      "not json",
      JSON.stringify({ type: "result", subtype: "success", total_cost_usd: 0.12 }),
    ].join("\n");
    expect(readTranscript(lines)).toEqual({ toolCalls: ["connections_list"], toolErrors: 1, finished: true, costUsd: 0.12 });
  });

  it("counts only approvals the user was asked for in the run's window", () => {
    const log = [
      { time: "2026-11-21T10:00:00Z", approval: "allowed" },
      { time: "2026-11-21T10:00:05Z", approval: "auto" },
      { time: "2026-11-21T10:00:06Z", approval: "denied" },
      { time: "2026-11-21T11:00:00Z", approval: "allowed" },
    ]
      .map((e) => JSON.stringify(e))
      .join("\n");
    expect(countApprovals(log, new Date("2026-11-21T09:59:00Z"), new Date("2026-11-21T10:01:00Z"))).toBe(2);
  });
});
