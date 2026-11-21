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
  it.todo("table_apply lifecycle on every sandbox (Phase 1)");
  it.todo("solution_export and solution_import round trip on every sandbox (Phase 1)");
});
