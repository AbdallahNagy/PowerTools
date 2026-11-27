import { describe, expect, it } from "vitest";
import { createAgentToolRegistry } from "../../../src/electron/mcp/registry";
import { measureToolBudget, TOOL_BUDGET } from "../../../src/electron/mcp/toolBudget";
import { AGENT_TOOLS } from "../../../src/electron/mcp/tools/index";
import type { AgentTool } from "../../../src/electron/mcp/types";

const tool = (name: string, description = "Read-only. Lists things."): AgentTool => ({
  name,
  group: "read",
  title: name,
  description,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  effect: "read",
  run: async () => ({ content: [] }),
});

describe("tool budget", () => {
  it("the tool set of 26 tools fits the agreed budget", () => {
    const use = measureToolBudget(AGENT_TOOLS);
    expect(AGENT_TOOLS).toHaveLength(26);
    expect(use.problems).toEqual([]);
  });

  it("fails above 28 tools", () => {
    const tools = Array.from({ length: TOOL_BUDGET.maxTools + 1 }, (_, i) => tool(`t${i}`));
    expect(measureToolBudget(tools).problems).toEqual(["29 tools is above the budget of 28"]);
  });

  it("fails on a description above 400 characters and on too many bytes in all", () => {
    const long = tool("long", `Read-only. ${"x".repeat(400)}`);
    expect(measureToolBudget([long]).problems[0]).toMatch(/"long" description is 411 characters/);
    expect(measureToolBudget([tool("a")], { ...TOOL_BUDGET, maxTotalBytes: 10 }).problems[0]).toMatch(/above 10/);
  });
});

describe("registry rules for plan tools", () => {
  const base = { ...tool("p_apply", "Changes the environment."), effect: undefined };

  it("accepts a tool with a plan() and no effect or describe", () => {
    const registry = createAgentToolRegistry([{ ...base, plan: async () => ({ effect: "read", hash: "h", steps: [], warnings: [] }) }]);
    // Settings counts it by the effect its description states; each call's plan decides what it asks.
    expect(registry.tools()[0]).toMatchObject({ effect: "change", perCall: true });
  });

  it("refuses a tool with both a plan() and an effect, or with neither", () => {
    expect(() =>
      createAgentToolRegistry([{ ...base, effect: "change", plan: async () => ({ effect: "read", hash: "h", steps: [], warnings: [] }) }]),
    ).toThrow(/effect comes from the plan/);
    expect(() => createAgentToolRegistry([base])).toThrow(/needs an effect or a plan/);
  });
});
