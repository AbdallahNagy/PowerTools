import { describe, expect, it, vi } from "vitest";
import { createAgentToolRegistry } from "../../../src/electron/mcp/registry";
import { READ_TOOLS } from "../../../src/electron/mcp/tools/index";
import { AgentToolError, type AgentToolContext, type ResolvedConnection } from "../../../src/electron/mcp/types";

const conn: ResolvedConnection = {
  displayName: "A · Dev",
  auth: { id: "id", envUrl: "https://a", crmType: "online", token: "t" },
};

function ctx(callSidecar: (...a: unknown[]) => unknown, overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  return {
    resolveConnection: async () => conn,
    callSidecar: callSidecar as AgentToolContext["callSidecar"],
    listConnections: () => [{ displayName: "A · Dev", kind: "online", envUrl: "https://a", active: true }],
    signal: new AbortController().signal,
    ...overrides,
  };
}

const tool = (name: string) => READ_TOOLS.find((t) => t.name === name)!;
const structured = (r: { structuredContent?: unknown }) => r.structuredContent as Record<string, unknown>;

describe("READ_TOOLS", () => {
  it("builds a valid registry with eight read tools", () => {
    const registry = createAgentToolRegistry(READ_TOOLS);
    expect(registry.list()).toHaveLength(8);
    expect(READ_TOOLS.every((t) => t.effect === "read" && t.description.includes("Read-only."))).toBe(true);
  });

  it("caps metadata_list_tables at 50 by default", async () => {
    const tables = Array.from({ length: 2000 }, (_, i) => ({ logicalName: `t${i}`, displayName: `T ${i}`, isCustom: false }));
    const result = await tool("metadata_list_tables").run({}, ctx(async () => tables));
    expect(structured(result)).toMatchObject({ total: 2000, returned: 50 });
    expect((structured(result).tables as unknown[]).length).toBe(50);
  });

  it("filters tables on logical and display name", async () => {
    const tables = [
      { logicalName: "account", displayName: "Account" },
      { logicalName: "new_thing", displayName: "Accounting Thing" },
      { logicalName: "contact", displayName: "Contact" },
    ];
    const result = await tool("metadata_list_tables").run({ search: "acc" }, ctx(async () => tables));
    expect(structured(result)).toMatchObject({ total: 2, returned: 2 });
  });

  it("filters custom-only columns and calls the columns route", async () => {
    const call = vi.fn(async () => [
      { logicalName: "name", isCustom: false },
      { logicalName: "new_x", isCustom: true },
    ]);
    const result = await tool("metadata_list_columns").run({ table: "account", customOnly: true }, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "GET", "/api/community-tools/metadata/tables/account/columns");
    expect(structured(result).total).toBe(1);
  });

  it("records_query clamps pageSize to 500", async () => {
    const call = vi.fn(async () => ({ records: [], moreRecords: false, pagingCookie: null, page: 1 }));
    await tool("records_query").run({ fetchXml: "<fetch/>", pageSize: 9999 }, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "POST", "/api/community-tools/data/fetch", {
      fetchXml: "<fetch/>",
      page: 1,
      pageSize: 500,
      pagingCookie: undefined,
    });
  });

  it("caps a huge records_query result", async () => {
    const wide = { records: Array.from({ length: 500 }, () => ({ id: "x", values: { big: "y".repeat(2000) } })), moreRecords: true };
    const result = await tool("records_query").run({ fetchXml: "<fetch/>" }, ctx(async () => wide));
    expect(Buffer.byteLength((result.content[0] as { text: string }).text, "utf8")).toBeLessThanOrEqual(102400);
    expect(JSON.stringify(result.structuredContent).length).toBeLessThan(102400);
  });

  it("marks Dataverse results untrusted but not connections_list", async () => {
    const meta = await tool("metadata_get_table").run({ table: "account" }, ctx(async () => ({ logicalName: "account" })));
    expect(meta._meta?.["powertools/untrusted"]).toBe(true);
    const rec = await tool("records_get").run({ table: "account", id: "x", columns: ["name"] }, ctx(async () => ({})));
    expect(rec._meta?.["powertools/untrusted"]).toBe(true);
    const list = await tool("connections_list").run({}, ctx(async () => null));
    expect(list._meta).toBeUndefined();
    expect(structured(list).connections).toHaveLength(1);
  });

  it("lets resolver errors propagate unchanged", async () => {
    const error = new AgentToolError("ConnectionNotFound", "nope");
    const c = ctx(async () => null, { resolveConnection: async () => { throw error; } });
    await expect(tool("metadata_get_table").run({ table: "account" }, c)).rejects.toBe(error);
  });
});
