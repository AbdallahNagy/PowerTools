import { bypassMsw } from "../../support/loopback";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ActivityEntry, ActivityLog } from "../../../src/electron/mcp/activityLog";
import { createConnectionResolver } from "../../../src/electron/mcp/connections";
import { startHttpHost, type HttpHost } from "../../../src/electron/mcp/httpHost";
import { createMcpRequestHandler, type McpRequestHandler } from "../../../src/electron/mcp/mcpServer";
import { MCP_INSTRUCTIONS } from "../../../src/electron/mcp/mcpService";
import { createAgentToolRegistry } from "../../../src/electron/mcp/registry";
import { createSidecarCaller } from "../../../src/electron/mcp/sidecarCaller";
import { READ_TOOLS } from "../../../src/electron/mcp/tools/index";

const TOKEN = "c".repeat(64);
let host: HttpHost | null = null;
let client: Client | null = null;
let handler: McpRequestHandler | null = null;

afterEach(async () => {
  await client?.close().catch(() => undefined);
  await handler?.closeAll();
  await host?.close();
  client = null;
  host = null;
  handler = null;
});

async function setup() {
  bypassMsw();
  const fetchFake = vi.fn(async () => new Response(JSON.stringify({ logicalName: "account" }), { status: 200 }));
  const resolver = createConnectionResolver({
    summaries: () => [
      { id: "id-dev", organization: "A", environment: "Dev", legacyName: null, envUrl: "https://a.crm.dynamics.com", crmType: "online" },
    ],
    activeId: () => "id-dev",
    resolveAuth: async (id) => ({ id, envUrl: "https://a.crm.dynamics.com", crmType: "online", token: "tok" }),
  });
  const entries: ActivityEntry[] = [];
  const log: ActivityLog = {
    append: async (e) => void entries.push(e),
    recent: async () => entries,
    prune: async () => undefined,
  };
  handler = createMcpRequestHandler({
    registry: createAgentToolRegistry(READ_TOOLS),
    context: () => ({
      resolveConnection: resolver.resolve,
      callSidecar: createSidecarCaller({ baseUrl: "http://sidecar", secret: "sec", fetch: fetchFake as never, refresh: resolver.refresh }),
      listConnections: resolver.list,
    }),
    log,
    instructions: MCP_INSTRUCTIONS,
    appVersion: "1.0.0",
  });
  host = await startHttpHost({ port: 0, tokens: () => [TOKEN], handle: handler.handle });
  client = new Client({ name: "test-client", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${host.port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    }),
  );
  return { client, fetchFake, entries, handler };
}

describe("MCP server", () => {
  it("lists the eight read tools and sends instructions", async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "connections_list",
      "metadata_get_choices",
      "metadata_get_table",
      "metadata_list_columns",
      "metadata_list_relationships",
      "metadata_list_tables",
      "records_get",
      "records_query",
    ]);
    expect(client.getInstructions()).toBe(MCP_INSTRUCTIONS);
    expect(client.getServerVersion()).toMatchObject({ name: "powertools", version: "1.0.0" });
  });

  it("calls connections_list", async () => {
    const { client } = await setup();
    const result = await client.callTool({ name: "connections_list", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ connections: [{ displayName: "A · Dev", active: true }] });
  });

  it("calls the sidecar with the secret and connection headers", async () => {
    const { client, fetchFake, entries } = await setup();
    const result = await client.callTool({ name: "metadata_get_table", arguments: { table: "account" } });
    expect(result._meta).toMatchObject({ "powertools/untrusted": true });
    const [url, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://sidecar/api/community-tools/metadata/tables/account");
    expect(init.headers).toMatchObject({ "X-Local-Secret": "sec", Authorization: "Bearer tok" });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      tool: "metadata_get_table",
      connection: "A · Dev",
      effect: "read",
      outcome: "ok",
      client: "test-client",
    });
    expect(JSON.stringify(entries)).not.toContain("tok\"");
  });

  it("answers invalid arguments with -32602 naming the field", async () => {
    const { client } = await setup();
    await expect(
      client.callTool({ name: "records_get", arguments: { table: "account", id: "nope", columns: ["name"] } }),
    ).rejects.toMatchObject({ code: -32602, message: expect.stringContaining("id") });
  });

  it("answers an unknown tool with -32602", async () => {
    const { client } = await setup();
    await expect(client.callTool({ name: "nope", arguments: {} })).rejects.toMatchObject({ code: -32602 });
  });

  it("turns tool errors into error results and logs them", async () => {
    const { client, entries } = await setup();
    const result = await client.callTool({ name: "metadata_get_table", arguments: { table: "account", connection: "Zed" } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "ConnectionNotFound" });
    expect(entries[0]).toMatchObject({ outcome: "error", code: "ConnectionNotFound" });
  });

  it("fails further calls after closeAll", async () => {
    const { client, handler } = await setup();
    await handler.closeAll();
    await expect(client.callTool({ name: "connections_list", arguments: {} })).rejects.toBeDefined();
  });
});
