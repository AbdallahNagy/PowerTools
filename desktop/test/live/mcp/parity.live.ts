/**
 * Live tests of the MCP server against the sandboxes in evals/mcp/sandboxes.json. Opt-in:
 *   npm run test:live:mcp
 * Needs a running Power Tools with the MCP server on, and a saved connection per sandbox. Never point it at production.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, loadLiveConfig, shapeDifferences, shapeOf, type Sandbox } from "./harness";

const { config, problem } = loadLiveConfig();
if (problem) console.warn(`[mcp live] skipped: ${problem}`);

type ToolResult = { isError?: boolean; structuredContent?: unknown };

/** A small script on this computer for the webresource_apply lifecycle; Power Tools reads it from the same machine. */
function liveScript(): string {
  const path = join(mkdtempSync(join(tmpdir(), "pte-live-")), "form.js");
  writeFileSync(path, "function pteLive() { return 1; }\n");
  return path;
}

describe.skipIf(!config)("MCP live: online and on-premises parity", () => {
  let client: Client;
  const sandboxes: Sandbox[] = config?.sandboxes ?? [];

  beforeAll(async () => {
    client = await connect(config!);
  });
  afterAll(async () => {
    await client?.close();
  });

  const call = async (tool: string, args: Record<string, unknown>) =>
    (await client.callTool({ name: tool, arguments: args })) as ToolResult;

  it("lists every sandbox connection with the right kind", async () => {
    const result = await call("connections_list", {});
    const listed = (result.structuredContent as { connections: Array<{ displayName: string; kind: string }> }).connections;
    for (const sandbox of sandboxes) {
      expect(listed, `connection "${sandbox.connection}"`).toContainEqual(
        expect.objectContaining({ displayName: sandbox.connection, kind: sandbox.kind }),
      );
    }
  });

  // Each read tool must answer with the same shape on every sandbox.
  const reads: Array<[string, Record<string, unknown>]> = [
    ["inspect_schema", { kind: "table", name: "account" }],
    ["inspect_ui", { kind: "view", table: "account", top: 5 }],
    ["inspect_solution", { kind: "solution", name: "PowerToolsEvals" }],
    ["records_query", { fetchXml: "<fetch top='1'><entity name='account'><attribute name='name' /></entity></fetch>" }],
    ["records_query", { table: "account", columns: ["name"], filter: [{ column: "statecode", operator: "eq", value: 0 }], pageSize: 1 }],
  ];

  it.each(reads)("%s answers the same shape on every sandbox", async (tool, args) => {
    const shapes = [];
    for (const sandbox of sandboxes) {
      const result = await call(tool, { ...args, connection: sandbox.connection });
      expect(result.isError, `${tool} on ${sandbox.name}`).toBeFalsy();
      shapes.push({ sandbox: sandbox.name, shape: shapeOf(result.structuredContent) });
    }
    for (const other of shapes.slice(1)) {
      expect(shapeDifferences(shapes[0].shape, other.shape), `${shapes[0].sandbox} vs ${other.sandbox}`).toEqual([]);
    }
  });

  /*
   * The apply lifecycle each family adds in Phase 1 and later: apply → verify (outcome "applied") → apply again
   * (outcome "unchanged") → remove → back as before, on every sandbox, then the result shapes compared.
   * Apply needs the sandbox connection's "allow changes" switch on; remove is destructive and always asks, so a
   * person answers those dialogs until an unattended approval for sandbox connections exists (see evals/mcp/README.md).
   */
  const lifecycleTable = {
    solution: "PowerToolsEvals",
    table: { schemaName: "pte_LiveProject", displayName: "Live Project", pluralName: "Live Projects" },
    columns: [
      { schemaName: "pte_Code", type: "text", displayName: "Code", maxLength: 40 },
      { schemaName: "pte_Budget", type: "money", displayName: "Budget" },
      { schemaName: "pte_Stage", type: "choice", displayName: "Stage", options: [{ label: "Planned" }, { label: "Active" }] },
      { schemaName: "pte_Due", type: "dateonly", displayName: "Due", behavior: "dateOnly" },
      { schemaName: "pte_AccountId", type: "lookup", displayName: "Customer", target: "account" },
    ],
    keys: [{ schemaName: "pte_LiveProjectCode", columns: ["pte_code"] }],
  };

  it("table_apply lifecycle on every sandbox: applied, unchanged, inspected as the same spec, removed", async () => {
    const shapes = [];
    for (const sandbox of sandboxes) {
      const on = { connection: sandbox.connection };
      try {
        const first = await call("table_apply", { ...lifecycleTable, ...on });
        expect(first.structuredContent, `apply on ${sandbox.name}`).toMatchObject({ outcome: "applied", remaining: { steps: [] } });
        const again = await call("table_apply", { ...lifecycleTable, ...on });
        expect(again.structuredContent, `apply again on ${sandbox.name}`).toMatchObject({ outcome: "unchanged" });

        // What inspect returns applies as unchanged: read, change, apply works without translation.
        const inspected = await call("inspect_schema", { kind: "table", name: "pte_liveproject", ...on });
        const described = (inspected.structuredContent as { result: { table: unknown; columns: unknown[] } }).result;
        const roundTrip = await call("table_apply", { solution: "PowerToolsEvals", table: described.table, columns: described.columns, dryRun: true, ...on });
        expect(roundTrip.structuredContent, `inspected spec on ${sandbox.name}`).toMatchObject({ outcome: "unchanged" });

        shapes.push({ sandbox: sandbox.name, shape: shapeOf(first.structuredContent) });
      } finally {
        // Destructive, so a person approves it until sandbox connections can approve unattended.
        await call("remove", { kind: "table", name: "pte_liveproject", ...on });
      }
    }
    for (const other of shapes.slice(1)) {
      expect(shapeDifferences(shapes[0].shape, other.shape), `${shapes[0].sandbox} vs ${other.sandbox}`).toEqual([]);
    }
  });

  // Phase 2 families: apply, apply again (unchanged), remove, with the result shapes compared across sandboxes.
  const lifecycles: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    [
      "choice_apply",
      { solution: "PowerToolsEvals", name: "pte_LivePriority", displayName: "Live Priority", options: [{ label: "Low" }, { label: "High", color: "#AA0000" }] },
      { kind: "choice", name: "pte_livepriority" },
    ],
    [
      "config_apply",
      { solution: "PowerToolsEvals", environmentVariables: [{ schemaName: "pte_LiveUrl", displayName: "Live URL", defaultValue: "https://a", value: "https://b" }] },
      { kind: "envvar", name: "pte_LiveUrl" },
    ],
    // Phase 3 families.
    [
      "webresource_apply",
      { solution: "PowerToolsEvals", files: [{ path: liveScript(), name: "pte_/live/form.js" }] },
      { kind: "webresource", name: "pte_/live/form.js" },
    ],
    [
      "role_apply",
      { solution: "PowerToolsEvals", role: { name: "PTE Live Role", tables: [{ table: "account", read: "global", write: "basic" }], privileges: [{ name: "prvExportToExcel", depth: "global" }] } },
      { kind: "role", name: "PTE Live Role" },
    ],
    [
      "form_apply",
      {
        solution: "PowerToolsEvals",
        form: "PTE Live Dashboard",
        formType: "dashboard",
        layout: { tabs: [{ name: "tab_0", sections: [{ name: "accounts", components: [{ name: "accounts", table: "account" }] }] }] },
      },
      { kind: "form", table: "none", name: "PTE Live Dashboard" },
    ],
    [
      "app_apply",
      {
        solution: "PowerToolsEvals",
        uniqueName: "pte_LiveApp",
        name: "PTE Live App",
        tables: [{ table: "account" }],
        siteMap: { areas: [{ title: "Main", groups: [{ title: "Customers", subareas: [{ table: "account" }] }] }] },
      },
      { kind: "app", name: "pte_LiveApp" },
    ],
  ];

  it.each(lifecycles)("%s lifecycle on every sandbox: applied, unchanged, removed", async (tool, spec, removal) => {
    const shapes = [];
    for (const sandbox of sandboxes) {
      const on = { connection: sandbox.connection };
      try {
        const first = await call(tool, { ...spec, ...on });
        expect(first.structuredContent, `${tool} on ${sandbox.name}`).toMatchObject({ outcome: "applied" });
        const again = await call(tool, { ...spec, ...on });
        expect(again.structuredContent, `${tool} again on ${sandbox.name}`).toMatchObject({ outcome: "unchanged" });
        shapes.push({ sandbox: sandbox.name, shape: shapeOf(first.structuredContent) });
      } finally {
        await call("remove", { ...removal, ...on });
      }
    }
    for (const other of shapes.slice(1)) {
      expect(shapeDifferences(shapes[0].shape, other.shape), `${shapes[0].sandbox} vs ${other.sandbox}`).toEqual([]);
    }
  });

  it("records_write then records_delete on every sandbox", async () => {
    for (const sandbox of sandboxes) {
      const on = { connection: sandbox.connection };
      const written = await call("records_write", { operations: [{ op: "create", table: "account", values: { name: "Power Tools Live" } }], ...on });
      const id = (written.structuredContent as { steps: Array<{ ids?: string[] }> }).steps[0].ids?.[0];
      expect(id, `created id on ${sandbox.name}`).toBeTruthy();
      const deleted = await call("records_delete", { records: [{ table: "account", id }], ...on });
      expect(deleted.structuredContent, `delete on ${sandbox.name}`).toMatchObject({ outcome: "applied" });
    }
  });

  it("solution_export and solution_import round trip on every sandbox", async () => {
    for (const sandbox of sandboxes) {
      const on = { connection: sandbox.connection };
      const exported = await call("solution_export", { solution: "PowerToolsEvals", ...on });
      expect(exported.isError, `export on ${sandbox.name}`).toBeFalsy();
      const path = (exported.structuredContent as { result: { path: string } }).result.path;

      // The installed version: nothing to do without force.
      const unchanged = await call("solution_import", { path, ...on });
      expect(unchanged.structuredContent, `import on ${sandbox.name}`).toMatchObject({ outcome: "unchanged" });

      // Destructive: a person approves the import dialog.
      const forced = await call("solution_import", { path, force: true, ...on });
      expect(forced.structuredContent, `forced import on ${sandbox.name}`).toMatchObject({ outcome: "applied" });
    }
  });
});
