/**
 * Live tests of the MCP server against the sandboxes in evals/mcp/sandboxes.json. Opt-in:
 *   npm run test:live:mcp
 * Needs a running Power Tools with the MCP server on, and a saved connection per sandbox. Never point it at production.
 */
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, loadLiveConfig, shapeDifferences, shapeOf, type Sandbox } from "./harness";

const { config, problem } = loadLiveConfig();
if (problem) console.warn(`[mcp live] skipped: ${problem}`);

type ToolResult = { isError?: boolean; structuredContent?: unknown };

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

  // Read tools that exist today; each must answer with the same shape on every sandbox.
  const reads: Array<[string, Record<string, unknown>]> = [
    ["metadata_get_table", { table: "account" }],
    ["records_query", { fetchXml: "<fetch top='1'><entity name='account'><attribute name='name' /></entity></fetch>" }],
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
        await call("schema_delete_table", { table: "pte_liveproject", ...on });
      }
    }
    for (const other of shapes.slice(1)) {
      expect(shapeDifferences(shapes[0].shape, other.shape), `${shapes[0].sandbox} vs ${other.sandbox}`).toEqual([]);
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
