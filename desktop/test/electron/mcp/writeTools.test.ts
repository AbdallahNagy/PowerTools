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
import { AGENT_TOOLS } from "../../../src/electron/mcp/tools/index";
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
    registry: createAgentToolRegistry(AGENT_TOOLS),
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

// Assign is a known write, so execute_message asks for it as a change; Delete is a known delete.
const assign = { message: "Assign", parameters: { Target: { $type: "EntityReference", logicalName: "account", id: GUID } } };
const remove = (table: string) => ({ message: "Delete", parameters: { Target: { $type: "EntityReference", logicalName: table, id: GUID } } });

describe("write tools and approval", () => {
  it("lists the write tools with no hints that would skip approval", async () => {
    const { call } = await setup();
    void call;
    const { tools } = await client!.listTools();
    for (const name of ["records_write", "records_delete", "execute_message", "table_apply", "remove"]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      expect(tool!.annotations?.readOnlyHint).toBeUndefined();
    }
  });

  it("asks for a change when the switch is off, and runs only after the user allows", async () => {
    const { call, asked, fetchFake } = await setup({ answer: "allow" });
    const result = await call("execute_message", { ...assign, connection: "A · Dev" });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ tool: "execute_message", connection: "A · Dev", effect: "change" });
    expect(result.isError).toBeFalsy();
    expect(fetchFake).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://sidecar/api/community-tools/data/execute");
    expect(JSON.parse(init.body as string)).toEqual(assign);
  });

  it("does not ask for a change when the connection switch is on", async () => {
    const { call, asked, entries } = await setup();
    const result = await call("execute_message", { ...assign, connection: "A · Test" });
    expect(asked).toHaveLength(0);
    expect(result.isError).toBeFalsy();
    expect(entries[0]).toMatchObject({ approval: "auto", effect: "change", outcome: "ok" });
  });

  it("returns ApprovalDenied with no sidecar call when the user denies", async () => {
    const { call, fetchFake, entries } = await setup({ answer: "deny" });
    const result = await call("execute_message", { ...assign, connection: "A · Dev" });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "ApprovalDenied" });
    expect((result.content as Array<{ text: string }>)[0].text).toContain("Do not retry; ask the user what to do instead.");
    expect(fetchFake).not.toHaveBeenCalled();
    expect(entries[0]).toMatchObject({ approval: "denied", outcome: "error", code: "ApprovalDenied" });
  });

  it("returns ApprovalUnavailable with no sidecar call when nobody can be asked", async () => {
    const { call, fetchFake } = await setup({ answer: "unavailable" });
    const result = await call("execute_message", { ...assign, connection: "A · Dev" });
    expect(result.structuredContent).toMatchObject({ code: "ApprovalUnavailable" });
    expect(fetchFake).not.toHaveBeenCalled();
  });

  it("returns ApprovalTimedOut when the gate times out", async () => {
    const gate: ApprovalGate = { decide: async () => "timed-out", respond: () => undefined, failAll: () => undefined };
    const { call, fetchFake, entries } = await setup({ gate });
    const result = await call("execute_message", { ...assign, connection: "A · Dev" });
    expect(result.structuredContent).toMatchObject({ code: "ApprovalTimedOut" });
    expect(fetchFake).not.toHaveBeenCalled();
    expect(entries[0]).toMatchObject({ approval: "timed-out" });
  });

  it("still asks for a delete when the connection switch is on", async () => {
    const { call, asked, fetchFake } = await setup({ answer: "allow" });
    await call("execute_message", { ...remove("account"), connection: "A · Test" });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ effect: "destructive", connection: "A · Test", removes: "whatever Delete removes or replaces" });
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
    await call("execute_message", assign);
    expect(asked[0].connection).toBe("A · Dev");
    const [, init] = fetchFake.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-id-dev");
  });

  it("records the approval outcome in the activity log", async () => {
    const { call, entries } = await setup({ answer: "allow" });
    await call("execute_message", { ...assign, connection: "A · Dev" });
    await call("connections_list", {});
    expect(entries.map((e) => e.approval)).toEqual(["allowed", "not-needed"]);
  });

  it("validates arguments before asking", async () => {
    const { call, asked } = await setup({ answer: "allow" });
    await expect(call("records_query", { table: "account", id: "nope", columns: ["name"] })).rejects.toMatchObject({ code: -32602 });
    await expect(call("execute_message", { message: "" })).rejects.toMatchObject({ code: -32602 });
    expect(asked).toHaveLength(0);
  });

  it("takes a call out of the approval queue when the client cancels, and asks about the next", async () => {
    const asked: ApprovalRequest[] = [];
    const gate = createApprovalGate({ present: (r) => void asked.push(r), dismiss: () => undefined, attention: () => undefined });
    const { entries } = await setup({ gate });
    const controller = new AbortController();
    const first = client!.callTool({ name: "execute_message", arguments: { ...assign, connection: "A · Dev" } }, undefined, { signal: controller.signal });
    const outcome = first.then(() => "done", () => "rejected");
    const second = client!.callTool({ name: "execute_message", arguments: remove("account") });
    await vi.waitFor(() => expect(asked).toHaveLength(1));

    controller.abort();

    expect(await outcome).toBe("rejected");
    await vi.waitFor(() => expect(asked).toHaveLength(2));
    expect(entries.find((e) => e.tool === "execute_message")).toMatchObject({ approval: "cancelled", outcome: "error", code: "Cancelled" });
    gate.respond(asked[1].id, false);
    await second;
  });

  it("cancels the plan request of an apply tool with the client", async () => {
    let lookupSignal: AbortSignal | null | undefined;
    let started!: () => void;
    const hasStarted = new Promise<void>((resolve) => (started = resolve));
    const { fetchFake } = await setup({ answer: "allow" });
    fetchFake.mockImplementation(((_url: string, init: RequestInit) => {
      lookupSignal = init.signal;
      started();
      return new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }) as never);
    const controller = new AbortController();
    const call = client!.callTool(
      { name: "records_write", arguments: { operations: [{ op: "update", table: "account", id: GUID, values: { name: "X" } }], connection: "A · Dev" } },
      undefined,
      { signal: controller.signal },
    ).then(() => "done", () => "rejected");
    await hasStarted;
    expect(lookupSignal?.aborted).toBe(false);

    controller.abort();

    await vi.waitFor(() => expect(lookupSignal?.aborted).toBe(true));
    expect(await call).toBe("rejected");
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
      call("execute_message", remove("account")),
      call("execute_message", remove("contact")),
    ]);
    expect(order).toHaveLength(2);
    expect(overlapped).toBe(false);
  });
});
