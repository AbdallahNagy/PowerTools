import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ActivityEntry, ActivityLog } from "../../../src/electron/mcp/activityLog";
import { createApprovalGate, type ApprovalGate, type ApprovalRequest } from "../../../src/electron/mcp/approval";
import { createConnectionResolver } from "../../../src/electron/mcp/connections";
import { startHttpHost, type HttpHost } from "../../../src/electron/mcp/httpHost";
import { createMcpRequestHandler, type McpRequestHandler } from "../../../src/electron/mcp/mcpServer";
import { createAgentToolRegistry } from "../../../src/electron/mcp/registry";
import { createSidecarCaller } from "../../../src/electron/mcp/sidecarCaller";
import { READ_TOOLS } from "../../../src/electron/mcp/tools/index";
import { WRITE_TOOLS } from "../../../src/electron/mcp/tools/recordWrites";
import { bypassMsw } from "../../support/loopback";

const TOKEN = "d".repeat(64);
let host: HttpHost | null = null;
let client: Client | null = null;
let handler: McpRequestHandler | null = null;

afterEach(async () => {
  await client?.close().catch(() => undefined);
  await handler?.closeAll();
  await host?.close();
  client = host = handler = null;
});

const GUID = "11111111-1111-1111-1111-111111111111";

async function setup(options: { answer?: "allow" | "deny" | "unavailable"; activeIds?: string[]; gate?: ApprovalGate } = {}) {
  bypassMsw();
  const fetchFake = vi.fn(async () => new Response(JSON.stringify({ id: GUID }), { status: 200 }));
  const activeIds = options.activeIds ?? ["id-dev"];
  let resolutions = 0;
  const resolver = createConnectionResolver({
    summaries: () => [
      { id: "id-dev", organization: "A", environment: "Dev", legacyName: null, envUrl: "https://dev.crm.dynamics.com", crmType: "online", agentChangesWithoutAsking: false },
      { id: "id-test", organization: "A", environment: "Test", legacyName: null, envUrl: "https://test.crm.dynamics.com", crmType: "online", agentChangesWithoutAsking: true },
    ],
    // The active connection changes between the first and later reads, as if the user switched.
    activeId: () => activeIds[Math.min(resolutions++, activeIds.length - 1)],
    resolveAuth: async (id) => ({ id, envUrl: `https://${id}.crm.dynamics.com`, crmType: "online", token: `tok-${id}` }),
  });
  const entries: ActivityEntry[] = [];
  const log: ActivityLog = { append: async (e) => void entries.push(e), recent: async () => entries, prune: async () => undefined };

  const asked: ApprovalRequest[] = [];
  const gate: ApprovalGate =
    options.gate ??
    createApprovalGate({
      present: (req) => {
        asked.push(req);
        queueMicrotask(() => {
          if (options.answer === "unavailable") gate.failAll("unavailable");
          else gate.respond(req.id, options.answer !== "deny");
        });
      },
      dismiss: () => undefined,
      attention: () => undefined,
    });

  handler = createMcpRequestHandler({
    registry: createAgentToolRegistry([...READ_TOOLS, ...WRITE_TOOLS]),
    context: () => ({
      resolveConnection: resolver.resolve,
      callSidecar: createSidecarCaller({ baseUrl: "http://sidecar", secret: "sec", fetch: fetchFake as never, refresh: resolver.refresh }),
      listConnections: resolver.list,
    }),
    log,
    gate,
    instructions: "x",
  });
  host = await startHttpHost({ port: 0, tokens: () => [TOKEN], handle: handler.handle });
  client = new Client({ name: "t", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${host.port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    }),
  );
  const call = (name: string, args: Record<string, unknown>) => client!.callTool({ name, arguments: args });
  return { call, fetchFake, asked, entries };
}

const update = { table: "account", id: GUID, values: { name: "X" } };

describe("write tools and approval", () => {
  it("lists the write tools with no hints that would skip approval", async () => {
    const { call } = await setup();
    void call;
    const { tools } = await client!.listTools();
    for (const name of ["records_create", "records_update", "records_delete", "records_associate", "records_disassociate", "execute_message"]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      expect(tool!.annotations?.readOnlyHint).toBeUndefined();
    }
    expect(tools.find((t) => t.name === "records_delete")!.annotations?.destructiveHint).toBe(true);
  });

  it("asks for a change when the switch is off, and runs only after the user allows", async () => {
    const { call, asked, fetchFake } = await setup({ answer: "allow" });
    const result = await call("records_update", { ...update, connection: "A · Dev" });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ tool: "records_update", connection: "A · Dev", effect: "change" });
    expect(result.isError).toBeFalsy();
    expect(fetchFake).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://sidecar/api/community-tools/data/update");
    expect(JSON.parse(init.body as string)).toEqual(update);
  });

  it("does not ask for a change when the connection switch is on", async () => {
    const { call, asked, entries } = await setup();
    const result = await call("records_update", { ...update, connection: "A · Test" });
    expect(asked).toHaveLength(0);
    expect(result.isError).toBeFalsy();
    expect(entries[0]).toMatchObject({ approval: "auto", effect: "change", outcome: "ok" });
  });

  it("returns ApprovalDenied with no sidecar call when the user denies", async () => {
    const { call, fetchFake, entries } = await setup({ answer: "deny" });
    const result = await call("records_update", { ...update, connection: "A · Dev" });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "ApprovalDenied" });
    expect((result.content as Array<{ text: string }>)[0].text).toContain("Do not retry; ask the user what to do instead.");
    expect(fetchFake).not.toHaveBeenCalled();
    expect(entries[0]).toMatchObject({ approval: "denied", outcome: "error", code: "ApprovalDenied" });
  });

  it("returns ApprovalUnavailable with no sidecar call when nobody can be asked", async () => {
    const { call, fetchFake } = await setup({ answer: "unavailable" });
    const result = await call("records_update", { ...update, connection: "A · Dev" });
    expect(result.structuredContent).toMatchObject({ code: "ApprovalUnavailable" });
    expect(fetchFake).not.toHaveBeenCalled();
  });

  it("returns ApprovalTimedOut when the gate times out", async () => {
    const gate: ApprovalGate = { decide: async () => "timed-out", respond: () => undefined, failAll: () => undefined };
    const { call, fetchFake, entries } = await setup({ gate });
    const result = await call("records_update", { ...update, connection: "A · Dev" });
    expect(result.structuredContent).toMatchObject({ code: "ApprovalTimedOut" });
    expect(fetchFake).not.toHaveBeenCalled();
    expect(entries[0]).toMatchObject({ approval: "timed-out" });
  });

  it("still asks for records_delete when the connection switch is on", async () => {
    const { call, asked, fetchFake } = await setup({ answer: "allow" });
    await call("records_delete", { table: "account", id: GUID, connection: "A · Test" });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ effect: "destructive", connection: "A · Test", removes: `record account ${GUID}` });
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });

  it("runs execute_message WhoAmI without asking", async () => {
    const { call, asked, fetchFake } = await setup({ answer: "deny" });
    const result = await call("execute_message", { message: "WhoAmI", parameters: {} });
    expect(result.isError).toBeFalsy();
    expect(asked).toHaveLength(0);
    expect(fetchFake).toHaveBeenCalledTimes(1);
  });

  it("refuses execute_message ExecuteMultiple as InvalidRequest without asking", async () => {
    const { call, asked, fetchFake } = await setup({ answer: "allow" });
    const result = await call("execute_message", { message: "ExecuteMultiple", parameters: {} });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "InvalidRequest" });
    expect(asked).toHaveLength(0);
    expect(fetchFake).not.toHaveBeenCalled();
  });

  it("asks for an unknown message as destructive, even with the switch on", async () => {
    const { call, asked } = await setup({ answer: "allow" });
    await call("execute_message", { message: "new_DoThing", parameters: {}, connection: "A · Test" });
    expect(asked).toHaveLength(1);
    expect(asked[0].effect).toBe("destructive");
  });

  it("asks about the connection it then uses, even if the active one changes meanwhile", async () => {
    const { call, asked, fetchFake } = await setup({ answer: "allow", activeIds: ["id-dev", "id-test"] });
    await call("records_update", update);
    expect(asked[0].connection).toBe("A · Dev");
    const [, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-id-dev");
  });

  it("records the approval outcome in the activity log", async () => {
    const { call, entries } = await setup({ answer: "allow" });
    await call("records_update", { ...update, connection: "A · Dev" });
    await call("metadata_get_table", { table: "account" });
    expect(entries.map((e) => e.approval)).toEqual(["allowed", "not-needed"]);
  });

  it("validates arguments before asking", async () => {
    const { call, asked } = await setup({ answer: "allow" });
    await expect(call("records_update", { table: "account", id: "nope", values: {} })).rejects.toMatchObject({ code: -32602 });
    expect(asked).toHaveLength(0);
  });

  it("asks twice, in sequence, for two parallel deletes", async () => {
    const order: string[] = [];
    let open = 0;
    let overlapped = false;
    const gate = createApprovalGate({
      present: (req) => {
        open += 1;
        if (open > 1) overlapped = true;
        order.push(req.summary);
        setTimeout(() => {
          open -= 1;
          gate.respond(req.id, true);
        }, 20);
      },
      dismiss: () => undefined,
      attention: () => undefined,
    });
    const { call } = await setup({ gate });
    await Promise.all([
      call("records_delete", { table: "account", id: GUID }),
      call("records_delete", { table: "contact", id: GUID }),
    ]);
    expect(order).toHaveLength(2);
    expect(overlapped).toBe(false);
  });
});
