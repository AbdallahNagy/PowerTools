import { bypassMsw } from "../../support/loopback";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ActivityEntry, ActivityLog } from "../../../src/electron/mcp/activityLog";
import type { ApprovalRequest } from "../../../src/electron/mcp/approval";
import { createConnectionResolver } from "../../../src/electron/mcp/connections";
import { startHttpHost, type HttpHost } from "../../../src/electron/mcp/httpHost";
import { createMcpRequestHandler, type McpRequestHandler } from "../../../src/electron/mcp/mcpServer";
import { planForDialog, planRemoves } from "../../../src/electron/mcp/planDialog";
import { createAgentToolRegistry } from "../../../src/electron/mcp/registry";
import { createSidecarCaller } from "../../../src/electron/mcp/sidecarCaller";
import { APPLY_RESULT_SCHEMA, applyTool } from "../../../src/electron/mcp/tools/applyTool";
import type { PlanPreview, PlanStep } from "../../../src/electron/mcp/types";

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

const step = (target: string, effect: PlanStep["effect"] = "change", over: Partial<PlanStep> = {}): PlanStep => ({
  op: effect === "destructive" ? "deleteColumn" : "createColumn",
  target,
  effect,
  kind: "run",
  ...over,
});

const plan = (steps: PlanStep[], hash = "hash-1"): PlanPreview => ({
  effect: steps.some((s) => s.kind === "run" && s.effect === "destructive") ? "destructive" : steps.some((s) => s.kind === "run") ? "change" : "read",
  hash,
  steps,
  warnings: [],
});

const tableApply = applyTool({
  name: "table_apply",
  family: "table",
  group: "schema",
  title: "Apply table",
  description: "Changes the environment. Creates or updates a table and its columns from a spec.",
  spec: {
    properties: { solution: { type: "string" }, table: { type: "string" } },
    required: ["solution", "table"],
  },
  describe: (args, p) => `change table ${String(args.table)} (${p.steps.length} steps)`,
  summarize: (args) => `table_apply ${String(args.table)}`,
});

interface Sidecar {
  plans: PlanPreview[];
  apply?: unknown;
  calls: Array<{ path: string; body: unknown }>;
}

async function setup(sidecar: Sidecar, decide: (req: ApprovalRequest) => Promise<string> = async () => "allowed", planTimeoutMs?: number) {
  bypassMsw();
  const fetchFake = vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    sidecar.calls.push({ path, body });
    if (path.endsWith("/plan")) {
      if (planTimeoutMs) {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 5_000);
          init.signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new DOMException("aborted", "AbortError"));
          });
        });
      }
      return new Response(JSON.stringify(sidecar.plans.shift()), { status: 200 });
    }
    return new Response(JSON.stringify(sidecar.apply), { status: 200 });
  });
  const resolver = createConnectionResolver({
    summaries: () => [
      { id: "id-dev", organization: "A", environment: "Dev", legacyName: null, envUrl: "https://a.crm.dynamics.com", crmType: "online" },
    ],
    activeId: () => "id-dev",
    resolveAuth: async (id) => ({ id, envUrl: "https://a.crm.dynamics.com", crmType: "online", token: "tok" }),
  });
  const entries: ActivityEntry[] = [];
  const log: ActivityLog = { append: async (e) => void entries.push(e), recent: async () => entries, prune: async () => undefined };
  const requests: ApprovalRequest[] = [];
  handler = createMcpRequestHandler({
    registry: createAgentToolRegistry([tableApply]),
    context: () => ({
      resolveConnection: resolver.resolve,
      callSidecar: createSidecarCaller({ baseUrl: "http://sidecar", secret: "sec", fetch: fetchFake as never }),
      listConnections: resolver.list,
    }),
    log,
    gate: {
      decide: async (req) => {
        requests.push({ ...req, id: "x" });
        return (await decide({ ...req, id: "x" })) as never;
      },
    },
    instructions: "test",
    ...(planTimeoutMs ? { planTimeoutMs } : {}),
  });
  host = await startHttpHost({ port: 0, tokens: () => [TOKEN], handle: handler.handle });
  client = new Client({ name: "test-client", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${host.port}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    }),
  );
  return { client, entries, requests };
}

const applied = {
  outcome: "applied",
  steps: [{ op: "createColumn", target: "con_budget", status: "done" }],
  published: ["con_project"],
  remaining: { steps: [] },
  warnings: [],
};

describe("apply tools", () => {
  it("are listed with connection and dryRun arguments and the apply result as output schema", async () => {
    const { client } = await setup({ plans: [], calls: [] });
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "table_apply")!;
    expect(Object.keys(tool.inputSchema.properties ?? {})).toEqual(["solution", "table", "connection", "dryRun"]);
    expect(tool.outputSchema).toEqual(APPLY_RESULT_SCHEMA);
    expect(tool.annotations?.readOnlyHint).toBeUndefined();
  });

  it("asks with the plan, sends the approved hash to apply, and logs the plan", async () => {
    const sidecar: Sidecar = { plans: [plan([step("con_budget")], "approved-hash")], apply: applied, calls: [] };
    const { client, requests, entries } = await setup(sidecar);

    const result = await client.callTool({ name: "table_apply", arguments: { solution: "Core", table: "con_project" } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(applied);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      effect: "change",
      summary: "change table con_project (1 steps)",
      plan: { hash: "approved-hash", total: 1 },
    });
    expect(sidecar.calls.map((c) => c.path)).toEqual(["/api/agent/table/plan", "/api/agent/table/apply"]);
    expect(sidecar.calls[0].body).toEqual({ solution: "Core", table: "con_project" });
    expect(sidecar.calls[1].body).toEqual({ spec: { solution: "Core", table: "con_project" }, planHash: "approved-hash" });
    expect(entries[0]).toMatchObject({
      tool: "table_apply",
      effect: "change",
      approval: "allowed",
      outcome: "ok",
      planHash: "approved-hash",
      steps: [{ op: "createColumn", target: "con_budget", effect: "change" }],
    });
  });

  it("takes the effect from the plan, so a step that drops something makes the call destructive", async () => {
    const sidecar: Sidecar = { plans: [plan([step("con_budget"), step("con_old", "destructive")])], apply: applied, calls: [] };
    const { client, requests } = await setup(sidecar);

    await client.callTool({ name: "table_apply", arguments: { solution: "Core", table: "con_project" } });

    expect(requests[0].effect).toBe("destructive");
    expect(requests[0].removes).toBe("con_old");
    expect(requests[0].plan!.groups[0].effect).toBe("destructive");
  });

  it("returns unchanged for an empty plan without asking or applying", async () => {
    const sidecar: Sidecar = { plans: [plan([])], calls: [] };
    const { client, requests, entries } = await setup(sidecar);

    const result = await client.callTool({ name: "table_apply", arguments: { solution: "Core", table: "con_project" } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ outcome: "unchanged" });
    expect(requests).toHaveLength(0);
    expect(sidecar.calls).toHaveLength(1);
    expect(entries[0]).toMatchObject({ effect: "read", approval: "not-needed" });
  });

  it("dryRun returns the plan as a read, without asking or applying", async () => {
    const sidecar: Sidecar = { plans: [plan([step("con_old", "destructive")])], calls: [] };
    const { client, requests } = await setup(sidecar);

    const result = await client.callTool({ name: "table_apply", arguments: { solution: "Core", table: "con_project", dryRun: true } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ outcome: "planned", remaining: { steps: [{ target: "con_old" }] } });
    expect(requests).toHaveLength(0);
    expect(sidecar.calls.map((c) => c.path)).toEqual(["/api/agent/table/plan"]);
  });

  it("denied approval never applies", async () => {
    const sidecar: Sidecar = { plans: [plan([step("con_budget")])], apply: applied, calls: [] };
    const { client } = await setup(sidecar, async () => "denied");

    const result = await client.callTool({ name: "table_apply", arguments: { solution: "Core", table: "con_project" } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "ApprovalDenied" });
    expect(sidecar.calls.map((c) => c.path)).toEqual(["/api/agent/table/plan"]);
  });

  it("marks partly applied, failed and refused results as errors the agent notices", async () => {
    for (const outcome of ["partlyApplied", "failed", "refused"]) {
      const sidecar: Sidecar = {
        plans: [plan([step("con_budget")])],
        apply: { ...applied, outcome, code: "DataverseFault", message: "boom" },
        calls: [],
      };
      const { client } = await setup(sidecar);
      const result = await client.callTool({ name: "table_apply", arguments: { solution: "Core", table: "con_project" } });
      expect(result.isError).toBe(true);
      expect((result.content as Array<{ text: string }>)[0].text).toContain("[DataverseFault] boom");
      await client.close();
      await handler!.closeAll();
      await host!.close();
    }
  });

  it("gives up building a plan after its own timeout", async () => {
    const sidecar: Sidecar = { plans: [plan([step("a")])], calls: [] };
    const { client, requests } = await setup(sidecar, async () => "allowed", 50);

    const result = await client.callTool({ name: "table_apply", arguments: { solution: "Core", table: "con_project" } });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "Timeout" });
    expect(requests).toHaveLength(0);
  });

  it("refuses an invalid plan from the sidecar", async () => {
    const sidecar: Sidecar = { plans: [{ nonsense: true } as never], calls: [] };
    const { client } = await setup(sidecar);

    const result = await client.callTool({ name: "table_apply", arguments: { solution: "Core", table: "con_project" } });

    expect(result.structuredContent).toMatchObject({ code: "Internal" });
  });
});

describe("plan dialog", () => {
  it("lists destructive steps first and cuts long plans to the limit with counts", () => {
    const steps = [
      ...Array.from({ length: 30 }, (_, i) => step(`col${i}`)),
      step("old", "destructive"),
      step("file", "change", { kind: "unsupported", reason: "Online only.", route: "solution_import" }),
    ];

    const dialog = planForDialog(plan(steps), 20);

    expect(dialog.groups.map((g) => [g.effect, g.count, g.steps.length])).toEqual([
      ["destructive", 1, 1],
      ["change", 30, 19],
      ["unsupported", 1, 0],
    ]);
    expect(dialog.total).toBe(32);
    expect(dialog.hidden).toBe(12);
  });

  it("explains unsupported steps with their route", () => {
    const dialog = planForDialog(plan([step("file", "change", { kind: "unsupported", reason: "Online only.", route: "solution_import" })]));
    expect(dialog.groups[0].steps[0].detail).toBe("Online only. Instead: solution_import");
  });

  it("names what a destructive plan removes", () => {
    expect(planRemoves(plan([step("a")]))).toBeUndefined();
    expect(planRemoves(plan(["a", "b", "c", "d", "e"].map((t) => step(t, "destructive"))))).toBe("a, b, c and 2 more");
  });
});

describe("apply tool factory", () => {
  it("refuses a spec that defines its own connection or dryRun", () => {
    expect(() =>
      applyTool({ ...tableApplyOptions(), spec: { properties: { dryRun: { type: "boolean" } } } }),
    ).toThrow(/must not define "dryRun"/);
  });
});

function tableApplyOptions() {
  return {
    name: "x_apply",
    family: "x",
    group: "schema" as const,
    title: "X",
    description: "Changes the environment.",
    spec: { properties: {} },
  };
}
