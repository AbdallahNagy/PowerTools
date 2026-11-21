import { describe, expect, it, vi } from "vitest";
import importSchema from "../../../src/electron/mcp/schemas/solution_import.input.json";
import tableSchema from "../../../src/electron/mcp/schemas/table_apply.input.json";
import { createAgentToolRegistry } from "../../../src/electron/mcp/registry";
import { measureToolBudget } from "../../../src/electron/mcp/toolBudget";
import { APPLY_RESULT_SCHEMA } from "../../../src/electron/mcp/tools/applyTool";
import { AGENT_TOOLS } from "../../../src/electron/mcp/tools/index";
import { buildFetchXml } from "../../../src/electron/mcp/tools/read";
import { AgentToolError, type AgentToolContext, type PlanPreview, type ResolvedConnection } from "../../../src/electron/mcp/types";

const conn: ResolvedConnection = {
  displayName: "A · Dev",
  auth: { id: "id", envUrl: "https://a", crmType: "onpremise", token: "t" },
  allowsChanges: false,
};

function ctx(callSidecar: (...a: unknown[]) => unknown, approvedPlan?: PlanPreview, overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  return {
    resolveConnection: async () => conn,
    callSidecar: callSidecar as AgentToolContext["callSidecar"],
    listConnections: () => [{ displayName: "A · Dev", kind: "onpremise", envUrl: "https://a", active: true }],
    signal: new AbortController().signal,
    ...(approvedPlan ? { approvedPlan } : {}),
    ...overrides,
  };
}

const registry = createAgentToolRegistry(AGENT_TOOLS);
const tool = (name: string) => AGENT_TOOLS.find((t) => t.name === name)!;
const structured = (r: { structuredContent?: unknown }) => r.structuredContent as Record<string, unknown>;

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

describe("the first release tool set", () => {
  it("is 24 tools in their Settings groups, within the tool budget", () => {
    expect(measureToolBudget(AGENT_TOOLS).problems).toEqual([]);
    expect(registry.tools().map((t) => [t.name, t.group, t.effect])).toEqual([
      ["connections_list", "connections", "read"],
      ["inspect_schema", "read", "read"],
      ["inspect_ui", "read", "read"],
      ["inspect_solution", "read", "read"],
      ["records_query", "read", "read"],
      ["solution_export", "solutions", "read"],
      ["records_write", "records", "varies"],
      ["table_apply", "schema", "varies"],
      ["choice_apply", "schema", "varies"],
      ["form_apply", "ui", "varies"],
      ["view_apply", "ui", "varies"],
      ["webresource_apply", "ui", "varies"],
      ["app_apply", "ui", "varies"],
      ["plugin_deploy", "logic", "varies"],
      ["plugin_step_apply", "logic", "varies"],
      ["customapi_apply", "logic", "varies"],
      ["flow_apply", "logic", "varies"],
      ["role_apply", "security", "varies"],
      ["solution_apply", "solutions", "varies"],
      ["config_apply", "solutions", "varies"],
      ["execute_message", "records", "varies"],
      ["records_delete", "records-delete", "varies"],
      ["remove", "remove", "varies"],
      ["solution_import", "solutions", "varies"],
    ]);
  });

  it.each([
    ["records_write", "records_write.input.json", "records_write"],
    ["records_delete", "records_delete.input.json", "records_delete"],
    ["choice_apply", "choice_apply.input.json", "choice"],
    ["form_apply", "form_apply.input.json", "form"],
    ["view_apply", "view_apply.input.json", "view"],
    ["solution_apply", "solution_apply.input.json", "solution"],
    ["config_apply", "config_apply.input.json", "config"],
    ["plugin_deploy", "plugin_deploy.input.json", "plugin_deploy"],
    ["plugin_step_apply", "plugin_step_apply.input.json", "plugin_step"],
    ["remove", "remove.input.json", "remove"],
    ["webresource_apply", "webresource_apply.input.json", "webresource"],
    ["app_apply", "app_apply.input.json", "app"],
    ["customapi_apply", "customapi_apply.input.json", "customapi"],
    ["role_apply", "role_apply.input.json", "role"],
  ])("%s takes the spec generated from C# and plans with the %s family", async (name, file, family) => {
    const schema = (await import(`../../../src/electron/mcp/schemas/${file}`)).default as { properties: object; required?: string[] };
    const apply = tool(name);
    expect(apply.inputSchema.properties).toEqual({ ...schema.properties, connection: expect.any(Object), dryRun: expect.any(Object) });
    expect(apply.inputSchema.required ?? []).toEqual(schema.required ?? []);
    expect(apply.outputSchema).toEqual(APPLY_RESULT_SCHEMA);
    const plan: PlanPreview = { effect: "change", hash: "h", steps: [], warnings: [] };
    const call = vi.fn(async () => plan);
    await apply.plan!({ connection: "A · Dev" }, ctx(call));
    expect(call.mock.calls[0].slice(1, 3)).toEqual(["POST", `/api/agent/${family}/plan`]);
  });

  it("describes the Phase 3 apply tools for the approval dialog", () => {
    const plan: PlanPreview = { effect: "change", hash: "h", steps: [{ op: "createRole", target: "R", effect: "change", kind: "run" }], warnings: [] };
    expect(tool("role_apply").describePlan!({ role: { name: "Sales" }, fieldSecurityProfiles: [{ name: "F" }] }, plan)).toBe("apply role Sales and field security (1 step)");
    expect(tool("form_apply").describePlan!({ form: "Overview", formType: "dashboard" }, plan)).toBe("apply dashboard Overview (1 step)");
    expect(tool("app_apply").describePlan!({ uniqueName: "new_App" }, plan)).toBe("apply app new_App (1 step)");
  });

  it("records_delete describes what goes from the plan", () => {
    const plan: PlanPreview = {
      effect: "destructive",
      hash: "h",
      steps: [
        { op: "delete", target: "account 1", effect: "destructive", kind: "run" },
        { op: "delete", target: "account 2", effect: "destructive", kind: "run" },
        { op: "disassociate", target: "account 1", effect: "destructive", kind: "run" },
      ],
      warnings: [],
    };
    expect(tool("records_delete").describePlan!({}, plan)).toBe("delete 2 records and remove 1 link");
    expect(registry.validate(tool("records_delete"), { query: { fetchXml: "<fetch/>", maxCount: 10 } })).toMatchObject({ ok: true });
  });

  it("validates the patch operations of form_apply and the kinds of remove", () => {
    const form = { solution: "Core", table: "account", form: "Information" };
    expect(registry.validate(tool("form_apply"), { ...form, operations: [{ op: "addField", column: "name", section: "summary" }] })).toMatchObject({ ok: true });
    expect(registry.validate(tool("form_apply"), { ...form, operations: [{ op: "replaceLayout" }] })).toMatchObject({ ok: false });
    const layout = { tabs: [{ name: "general", sections: [{ name: "summary", fields: ["name"] }] }] };
    expect(registry.validate(tool("form_apply"), { ...form, layout })).toMatchObject({ ok: true });
    expect(registry.validate(tool("form_apply"), { solution: "Core", form: "Overview", formType: "dashboard", layout })).toMatchObject({ ok: true });
    expect(registry.validate(tool("form_apply"), { ...form, operations: [{ op: "addHandler", event: "onload", library: "new_/a.js", function: "f" }] })).toMatchObject({ ok: true });
    expect(registry.validate(tool("remove"), { kind: "choiceoption", name: "new_priority", value: 100000000 })).toMatchObject({ ok: true });
    expect(registry.validate(tool("remove"), { kind: "record", name: "x" })).toMatchObject({ ok: false });
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

describe("read tools", () => {
  it("are read-only and say so", () => {
    const reads = AGENT_TOOLS.filter((t) => t.effect === "read");
    expect(reads.map((t) => t.name)).toEqual(["connections_list", "inspect_schema", "inspect_ui", "inspect_solution", "records_query", "solution_export"]);
    expect(reads.every((t) => t.description.includes("Read-only."))).toBe(true);
  });

  it.each([
    ["inspect_ui", "/api/agent/inspect/ui", { kind: "form", table: "account", name: "Information" }],
    ["inspect_solution", "/api/agent/inspect/solution", { kind: "pluginstep", name: "Account update" }],
  ])("%s posts the kind and name and returns untrusted data", async (name, route, args) => {
    const call = vi.fn(async () => ({ tabs: [] }));

    const result = await tool(name).run({ ...args, connection: "A · Dev" }, ctx(call));

    expect(call).toHaveBeenCalledWith(conn, "POST", route, args, expect.anything());
    expect(structured(result)).toMatchObject({ result: { tabs: [] } });
    expect(result._meta).toEqual({ "powertools/untrusted": true });
  });

  it("inspect_ui and inspect_solution refuse kinds of the other tool", () => {
    expect(registry.validate(tool("inspect_ui"), { kind: "pluginstep" })).toMatchObject({ ok: false });
    expect(registry.validate(tool("inspect_solution"), { kind: "form" })).toMatchObject({ ok: false });
    expect(registry.validate(tool("inspect_solution"), { kind: "layers", name: "new_/a.js", componentKind: "webresource" })).toMatchObject({ ok: true });
  });

  it("records_query sends FetchXML as given and clamps pageSize to 500", async () => {
    const call = vi.fn(async () => ({ records: [], moreRecords: false, pagingCookie: null, page: 1 }));
    await tool("records_query").run({ fetchXml: "<fetch/>", pageSize: 9999 }, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "POST", "/api/community-tools/data/fetch", { fetchXml: "<fetch/>", page: 1, pageSize: 500, pagingCookie: undefined }, expect.anything());
  });

  it("records_query builds FetchXML from a table, columns, filter and order", async () => {
    const call = vi.fn(async () => ({ records: [{ id: "1" }] }));
    const args = {
      table: "account",
      columns: ["name", "revenue"],
      filter: [
        { column: "name", operator: "like", value: "Con%" },
        { column: "statecode", operator: "in", values: [0, 1] },
        { column: "parentaccountid", operator: "null" },
      ],
      orderBy: "name",
      descending: true,
    };

    const result = await tool("records_query").run(args, ctx(call));

    const body = (call.mock.calls[0] as unknown[])[3] as { fetchXml: string };
    expect(body.fetchXml).toBe(
      '<fetch><entity name="account"><attribute name="name"/><attribute name="revenue"/><order attribute="name" descending="true"/>' +
        '<filter type="and"><condition attribute="name" operator="like" value="Con%"/>' +
        '<condition attribute="statecode" operator="in"><value>0</value><value>1</value></condition>' +
        '<condition attribute="parentaccountid" operator="null"/></filter></entity></fetch>',
    );
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining("Returned 1 record(s).") });
  });

  it("escapes values in built FetchXML and asks for every column when none are listed", () => {
    expect(buildFetchXml({ table: "account", filter: [{ column: "name", operator: "eq", value: `A"<&>'` }] })).toBe(
      '<fetch><entity name="account"><all-attributes/><filter type="and"><condition attribute="name" operator="eq" value="A&quot;&lt;&amp;&gt;&apos;"/></filter></entity></fetch>',
    );
    expect(() => buildFetchXml({ table: "account", filter: [{ column: "name", operator: "eq" }] })).toThrow(AgentToolError);
    expect(() => buildFetchXml({ table: "account", filter: [{ column: "statecode", operator: "in" }] })).toThrow(AgentToolError);
  });

  it("records_query needs fetchXml or table, not both", async () => {
    await expect(tool("records_query").run({}, ctx(vi.fn()))).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(tool("records_query").run({ fetchXml: "<fetch/>", table: "account" }, ctx(vi.fn()))).rejects.toMatchObject({ code: "InvalidRequest" });
  });

  it("records_query with an id returns only the asked-for columns, with null for empty ones", async () => {
    const row = {
      logicalName: "account",
      id: "x",
      values: { name: "A", accountid: "x", transactioncurrencyid: { $type: "EntityReference" } },
      formatted: { transactioncurrencyid: "EGP", name: "A" },
    };
    const call = vi.fn(async () => row);
    const id = "11111111-1111-1111-1111-111111111111";

    const rec = await tool("records_query").run({ table: "account", id, columns: ["name", "revenue"] }, ctx(call));

    expect(call).toHaveBeenCalledWith(conn, "POST", "/api/community-tools/data/retrieve", { table: "account", id, columns: ["name", "revenue"] }, expect.anything());
    expect(structured(rec).record).toEqual({ logicalName: "account", id: "x", values: { name: "A", revenue: null }, formatted: { name: "A" } });
    await expect(tool("records_query").run({ table: "account", id }, ctx(call))).rejects.toMatchObject({ code: "InvalidRequest" });
  });

  it("caps a huge records_query result", async () => {
    const wide = { records: Array.from({ length: 500 }, () => ({ id: "x", values: { big: "y".repeat(2000) } })), moreRecords: true };
    const result = await tool("records_query").run({ fetchXml: "<fetch/>" }, ctx(async () => wide));
    expect(Buffer.byteLength((result.content[0] as { text: string }).text, "utf8")).toBeLessThanOrEqual(102400);
    expect(result.structuredContent).toBeUndefined();
  });

  it("connections_list is not marked untrusted and lists each connection's kind", async () => {
    const list = await tool("connections_list").run({}, ctx(async () => null));
    expect(list._meta).toBeUndefined();
    expect(structured(list).connections).toEqual([{ displayName: "A · Dev", kind: "onpremise", envUrl: "https://a", active: true }]);
  });

  it("lets resolver errors propagate unchanged", async () => {
    const error = new AgentToolError("ConnectionNotFound", "nope");
    const c = ctx(async () => null, undefined, { resolveConnection: async () => { throw error; } });
    await expect(tool("inspect_ui").run({ kind: "app" }, c)).rejects.toBe(error);
  });
});
