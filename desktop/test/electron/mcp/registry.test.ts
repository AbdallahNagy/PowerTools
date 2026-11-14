import { describe, expect, it } from "vitest";
import { createAgentToolRegistry } from "../../../src/electron/mcp/registry";
import type { AgentTool } from "../../../src/electron/mcp/types";

function tool(overrides: Partial<AgentTool> = {}): AgentTool {
  return {
    name: "demo_tool",
    group: "metadata",
    title: "Demo",
    description: "Does a thing. Read-only.",
    inputSchema: {
      type: "object",
      properties: { connection: { type: "string", description: "Connection name." } },
      required: [],
      additionalProperties: false,
    },
    effect: "read",
    run: async () => ({ content: [] }),
    ...overrides,
  };
}

describe("createAgentToolRegistry", () => {
  it.each(["Bad-Name", "", "x".repeat(65), "has space"])("rejects name %j", (name) => {
    expect(() => createAgentToolRegistry([tool({ name })])).toThrow();
  });

  it("rejects duplicates", () => {
    expect(() => createAgentToolRegistry([tool(), tool()])).toThrow(/Duplicate/);
  });

  it("rejects long descriptions", () => {
    expect(() => createAgentToolRegistry([tool({ description: `${"a".repeat(400)} Read-only.` })])).toThrow(/longer/);
  });

  it("rejects descriptions without an effect class", () => {
    expect(() => createAgentToolRegistry([tool({ description: "Does a thing." })])).toThrow(/effect class/);
  });

  it("accepts each effect marker", () => {
    expect(() =>
      createAgentToolRegistry([
        tool({ name: "a", description: "Changes the environment.", effect: "change", describe: () => ({ summary: "x" }) }),
        tool({ name: "b", description: "Destructive: removes it.", effect: "destructive", describe: () => ({ summary: "x" }) }),
      ]),
    ).not.toThrow();
  });

  it("requires a describe() for any tool that is not plainly a read", () => {
    expect(() =>
      createAgentToolRegistry([tool({ description: "Changes the environment.", effect: "change" })]),
    ).toThrow(/describe/);
    expect(() =>
      createAgentToolRegistry([tool({ description: "Changes the environment.", effect: () => "change" })]),
    ).toThrow(/describe/);
  });

  it("hides the tools of a disabled group from list and get, and counts every group", () => {
    const off = new Set<string>(["schema"]);
    const registry = createAgentToolRegistry(
      [tool({ name: "a", group: "metadata" }), tool({ name: "b", group: "schema" }), tool({ name: "c", group: "schema" })],
      { isGroupEnabled: (group) => !off.has(group) },
    );
    expect(registry.list().map((t) => t.name)).toEqual(["a"]);
    expect(registry.get("b")).toBeUndefined();
    expect(registry.get("a")).toBeDefined();
    expect(registry.groups().find((g) => g.group === "schema")!.tools).toBe(2);
    expect(registry.groups().map((g) => g.group)).toEqual(["connections", "metadata", "records", "schema", "solutions", "plugins", "envvars"]);
    off.delete("schema");
    expect(registry.list().map((t) => t.name)).toEqual(["a", "b", "c"]);
  });

  it("hides a disabled tool from list and get, but keeps it in tools()", () => {
    const off = new Set<string>(["b"]);
    const registry = createAgentToolRegistry(
      [
        tool({ name: "a" }),
        tool({ name: "b", description: "Changes the environment.", effect: "change", describe: () => ({ summary: "x" }) }),
        tool({ name: "c", description: "Destructive: removes it.", effect: "destructive", describe: () => ({ summary: "x" }) }),
        tool({ name: "d", description: "Changes the environment.", effect: () => "change", describe: () => ({ summary: "x" }) }),
      ],
      { isToolEnabled: (name) => !off.has(name) },
    );
    expect(registry.list().map((t) => t.name)).toEqual(["a", "c", "d"]);
    expect(registry.get("b")).toBeUndefined();
    expect(registry.tools().map((t) => [t.name, t.effect])).toEqual([
      ["a", "read"],
      ["b", "change"],
      ["c", "destructive"],
      ["d", "varies"],
    ]);
    off.delete("b");
    expect(registry.get("b")).toBeDefined();
  });

  it("offers a tool only when its group is on as well", () => {
    const registry = createAgentToolRegistry([tool({ name: "a", group: "schema" })], {
      isGroupEnabled: () => false,
      isToolEnabled: () => true,
    });
    expect(registry.list()).toEqual([]);
  });

  it("validates arguments and names the field", () => {
    const registry = createAgentToolRegistry([tool()]);
    const t = registry.get("demo_tool")!;
    expect(registry.validate(t, { connection: "A" })).toEqual({ ok: true, args: { connection: "A" } });
    expect(registry.validate(t, undefined)).toEqual({ ok: true, args: {} });
    expect(registry.validate(t, { connection: 5 })).toEqual({ ok: false, message: '"connection" must be string' });
    const extra = registry.validate(t, { other: 1 });
    expect(extra.ok === false && extra.message).toContain("other");
  });

  it("lists annotations that match the effect", () => {
    const registry = createAgentToolRegistry([
      tool({ name: "r" }),
      tool({ name: "c", description: "Changes the environment.", effect: "change", describe: () => ({ summary: "x" }) }),
      tool({ name: "d", description: "Destructive: removes.", effect: "destructive", describe: () => ({ summary: "x" }) }),
    ]);
    const [r, c, d] = registry.list();
    expect(r.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
    expect(c.annotations?.readOnlyHint).toBeUndefined();
    expect(c.annotations?.destructiveHint).toBeUndefined();
    expect(d.annotations?.destructiveHint).toBe(true);
  });
});
