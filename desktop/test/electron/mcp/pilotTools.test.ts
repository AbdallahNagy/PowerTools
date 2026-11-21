import { describe, expect, it, vi } from "vitest";
import importSchema from "../../../src/electron/mcp/schemas/solution_import.input.json";
import tableSchema from "../../../src/electron/mcp/schemas/table_apply.input.json";
import { createAgentToolRegistry } from "../../../src/electron/mcp/registry";
import { measureToolBudget } from "../../../src/electron/mcp/toolBudget";
import { APPLY_RESULT_SCHEMA } from "../../../src/electron/mcp/tools/applyTool";
import { PLAN_APPLY_TOOLS } from "../../../src/electron/mcp/tools/index";
import type { AgentToolContext, PlanPreview, ResolvedConnection } from "../../../src/electron/mcp/types";

const conn: ResolvedConnection = {
  displayName: "A · Dev",
  auth: { id: "id", envUrl: "https://a", crmType: "onpremise", token: "t" },
  allowsChanges: false,
};

function ctx(callSidecar: (...a: unknown[]) => unknown, approvedPlan?: PlanPreview): AgentToolContext {
  return {
    resolveConnection: async () => conn,
    callSidecar: callSidecar as AgentToolContext["callSidecar"],
    listConnections: () => [],
    signal: new AbortController().signal,
    ...(approvedPlan ? { approvedPlan } : {}),
  };
}

const registry = createAgentToolRegistry(PLAN_APPLY_TOOLS);
const tool = (name: string) => PLAN_APPLY_TOOLS.find((t) => t.name === name)!;

const project = {
  solution: "Core",
  table: { schemaName: "con_Project", displayName: "Project", pluralName: "Projects", ownership: "user", primaryName: { schemaName: "con_Name", maxLength: 200 } },
  columns: [
    { schemaName: "con_Budget", type: "money", displayName: "Budget" },
    { schemaName: "con_Stage", type: "choice", displayName: "Stage", options: [{ label: "Planned" }, { label: "Active" }, { label: "Closed" }] },
    { schemaName: "con_AccountId", type: "lookup", target: "account", displayName: "Customer" },
  ],
  keys: [{ schemaName: "con_ProjectCode", columns: ["con_name"] }],
};

describe("Phase 1 pilot tools", () => {
  it("are inspect_schema, table_apply, solution_export and solution_import, within the tool budget", () => {
    expect(PLAN_APPLY_TOOLS.map((t) => t.name)).toEqual(["inspect_schema", "table_apply", "solution_export", "solution_import"]);
    expect(measureToolBudget(PLAN_APPLY_TOOLS).problems).toEqual([]);
    expect(registry.tools().map((t) => [t.name, t.effect])).toEqual([
      ["inspect_schema", "read"],
      ["table_apply", "varies"],
      ["solution_export", "read"],
      ["solution_import", "varies"],
    ]);
  });

  it("take their apply specs from the schemas generated from the C# spec types", () => {
    const table = tool("table_apply");
    expect(table.inputSchema.properties).toEqual({ ...tableSchema.properties, connection: expect.any(Object), dryRun: expect.any(Object) });
    expect(table.inputSchema.required).toEqual(["solution", "table"]);
    expect(table.outputSchema).toEqual(APPLY_RESULT_SCHEMA);
    expect(tool("solution_import").inputSchema.properties).toEqual({ ...importSchema.properties, connection: expect.any(Object), dryRun: expect.any(Object) });
  });

  it("accept the table spec from the plan document and refuse unknown types and properties", () => {
    expect(registry.validate(tool("table_apply"), project)).toMatchObject({ ok: true });
    const badType = { ...project, columns: [{ schemaName: "con_X", type: "bigint" }] };
    expect(registry.validate(tool("table_apply"), badType)).toMatchObject({ ok: false });
    const extra = { ...project, table: { ...project.table, color: "red" } };
    expect(registry.validate(tool("table_apply"), extra)).toMatchObject({ ok: false });
    expect(registry.validate(tool("table_apply"), { table: project.table })).toMatchObject({ ok: false });
  });

  it("table_apply sends the spec to plan and the approved hash to apply, never the connection or dryRun", async () => {
    const plan: PlanPreview = { effect: "change", hash: "h1", steps: [{ op: "createTable", target: "con_project", effect: "change", kind: "run" }], warnings: [] };
    const call = vi.fn(async (_c: unknown, _m: unknown, path: unknown) =>
      String(path).endsWith("/plan") ? plan : { outcome: "applied", steps: [], published: ["con_project"], remaining: { steps: [] }, warnings: [] },
    );
    const args = { ...project, connection: "A · Dev" };

    const preview = await tool("table_apply").plan!(args, ctx(call));
    const result = await tool("table_apply").run(args, ctx(call, preview));

    expect(call.mock.calls[0].slice(1, 4)).toEqual(["POST", "/api/agent/table/plan", project]);
    expect(call.mock.calls[1].slice(1, 4)).toEqual(["POST", "/api/agent/table/apply", { spec: project, planHash: "h1" }]);
    expect(result.isError).toBeUndefined();
    expect(tool("table_apply").describePlan!(args, plan)).toBe("apply table con_project (1 step)");
  });

  it("inspect_schema posts the kind and name and returns the result as untrusted data", async () => {
    const call = vi.fn(async () => ({ logicalName: "con_project" }));

    const result = await tool("inspect_schema").run({ kind: "table", name: "con_project", connection: "A · Dev" }, ctx(call));

    expect(call).toHaveBeenCalledWith(conn, "POST", "/api/agent/inspect/schema", { kind: "table", name: "con_project" }, expect.anything());
    expect(result.structuredContent).toMatchObject({ result: { logicalName: "con_project" } });
    expect(result._meta).toEqual({ "powertools/untrusted": true });
    expect(registry.validate(tool("inspect_schema"), { kind: "form" })).toMatchObject({ ok: false });
  });

  it("solution_export posts to the export route and reports progress", async () => {
    const call = vi.fn(async () => ({ path: "C:\\Users\\a\\Documents\\Power Tools\\Solutions\\Core_1_0_0_0_managed.zip" }));

    const result = await tool("solution_export").run({ solution: "Core", managed: true }, ctx(call));

    expect(call).toHaveBeenCalledWith(conn, "POST", "/api/agent/solution/export", { solution: "Core", managed: true }, expect.anything());
    expect(result.structuredContent).toMatchObject({ result: { path: expect.stringContaining("Core_1_0_0_0_managed.zip") } });
    expect(tool("solution_export").reportsProgress).toBe(true);
  });

  it("solution_import names the file in the dialog and reports progress", () => {
    const plan: PlanPreview = { effect: "destructive", hash: "h", steps: [], warnings: [] };
    expect(tool("solution_import").describePlan!({ path: "C:\\drops\\Core_1_2_0_0_managed.zip" }, plan)).toBe("import solution file Core_1_2_0_0_managed.zip");
    expect(tool("solution_import").reportsProgress).toBe(true);
    expect(registry.validate(tool("solution_import"), { path: "C:\\drops\\a.zip", mode: "upgrade", environmentVariables: { con_Url: "x" } })).toMatchObject({ ok: true });
    expect(registry.validate(tool("solution_import"), { path: "C:\\drops\\a.zip", mode: "replace" })).toMatchObject({ ok: false });
  });
});
