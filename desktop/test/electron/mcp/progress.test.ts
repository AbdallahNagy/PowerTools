import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createConnectionResolver } from "../../../src/electron/mcp/connections";
import { startHttpHost, type HttpHost } from "../../../src/electron/mcp/httpHost";
import { createMcpRequestHandler, type McpRequestHandler } from "../../../src/electron/mcp/mcpServer";
import { createAgentToolRegistry } from "../../../src/electron/mcp/registry";
import { createSidecarCaller } from "../../../src/electron/mcp/sidecarCaller";
import { READ_TOOLS } from "../../../src/electron/mcp/tools/index";
import { PLUGIN_TOOLS } from "../../../src/electron/mcp/tools/plugins";
import { SCHEMA_TOOLS } from "../../../src/electron/mcp/tools/schema";
import { SOLUTION_TOOLS } from "../../../src/electron/mcp/tools/solutions";
import { bypassMsw } from "../../support/loopback";

const TOKEN = "e".repeat(64);
let host: HttpHost | null = null;
let client: Client | null = null;
let handler: McpRequestHandler | null = null;

afterEach(async () => {
  await client?.close().catch(() => undefined);
  await handler?.closeAll();
  await host?.close();
  client = host = handler = null;
});

async function setup(fetchFake: (url: string, init: RequestInit) => Promise<Response>) {
  bypassMsw();
  const resolver = createConnectionResolver({
    // The switch is on, so changes run without a dialog and the tests stay about progress and cancelling.
    summaries: () => [
      { id: "id-dev", organization: "A", environment: "Dev", legacyName: null, envUrl: "https://dev", crmType: "online", agentChangesWithoutAsking: true },
    ],
    activeId: () => "id-dev",
    resolveAuth: async (id) => ({ id, envUrl: "https://dev", crmType: "online", token: "tok" }),
  });
  handler = createMcpRequestHandler({
    registry: createAgentToolRegistry([...READ_TOOLS, ...SCHEMA_TOOLS, ...SOLUTION_TOOLS, ...PLUGIN_TOOLS]),
    context: () => ({
      resolveConnection: resolver.resolve,
      callSidecar: createSidecarCaller({ baseUrl: "http://sidecar", secret: "s", fetch: fetchFake as never, refresh: resolver.refresh }),
      listConnections: resolver.list,
    }),
    log: { append: async () => undefined, recent: async () => [], prune: async () => undefined },
    gate: { decide: async (_req, allows) => (allows ? "auto" : "denied") },
    instructions: "x",
  });
  host = await startHttpHost({ port: 0, tokens: () => [TOKEN], handle: handler.handle });
  client = new Client({ name: "t", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${host.port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    }),
  );
  return client;
}

const ok = async () => new Response(JSON.stringify({ published: "all" }), { status: 200 });

describe("progress notifications", () => {
  it.each([
    ["schema_publish", {}],
    ["solutions_create_patch", { solution: "Core" }],
    ["solutions_clone", { solution: "Core", version: "2.0.0.0" }],
  ])("%s reports progress 0 then 1 to a client that sent a progress token", async (name, args) => {
    const c = await setup(ok);
    const seen: number[] = [];
    // Destructive calls ask first, and the gate here refuses them; progress still brackets the call.
    await c.callTool({ name, arguments: args }, undefined, { onprogress: (p) => void seen.push(p.progress) });
    expect(seen).toEqual([0, 1]);
  });

  it("sends the total with the final progress", async () => {
    const c = await setup(ok);
    const events: Array<{ progress: number; total?: number }> = [];
    await c.callTool({ name: "schema_publish", arguments: {} }, undefined, { onprogress: (p) => void events.push(p) });
    expect(events).toEqual([
      { progress: 0, total: 1 },
      { progress: 1, total: 1 },
    ]);
  });

  it("sends nothing without a progress token", async () => {
    const c = await setup(ok);
    const result = await c.callTool({ name: "schema_publish", arguments: {} });
    expect(result.isError).toBeFalsy();
  });

  it("sends nothing for a tool that does not report progress", async () => {
    const c = await setup(async () => new Response(JSON.stringify({ logicalName: "account" }), { status: 200 }));
    const seen: number[] = [];
    await c.callTool({ name: "metadata_get_table", arguments: { table: "account" } }, undefined, { onprogress: (p) => void seen.push(p.progress) });
    expect(seen).toEqual([]);
  });

  it("marks exactly the five long operations", () => {
    const names = [...SCHEMA_TOOLS, ...SOLUTION_TOOLS, ...PLUGIN_TOOLS, ...READ_TOOLS].filter((t) => t.reportsProgress).map((t) => t.name).sort();
    expect(names).toEqual(["plugins_register_assembly", "plugins_update_assembly", "schema_publish", "solutions_clone", "solutions_create_patch"]);
  });
});

describe("cancellation", () => {
  it("aborts the sidecar request when the client cancels the call", async () => {
    let sidecarSignal: AbortSignal | null | undefined;
    let started!: () => void;
    const hasStarted = new Promise<void>((resolve) => (started = resolve));
    const c = await setup((_url, init) => {
      sidecarSignal = init.signal;
      started();
      // Never answers; it ends only when the request is aborted, like a real fetch.
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });

    const controller = new AbortController();
    const call = c.callTool({ name: "metadata_get_table", arguments: { table: "account" } }, undefined, { signal: controller.signal });
    const outcome = call.then(() => "done", () => "rejected");
    await hasStarted;
    expect(sidecarSignal?.aborted).toBe(false);

    controller.abort();

    await vi.waitFor(() => expect(sidecarSignal?.aborted).toBe(true));
    expect(await outcome).toBe("rejected");
  });
});
