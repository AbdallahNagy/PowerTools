import { describe, expect, it, vi } from "vitest";
import { createAgentToolRegistry } from "../../../src/electron/mcp/registry";
import { READ_TOOLS } from "../../../src/electron/mcp/tools/index";
import { SCHEMA_TOOLS } from "../../../src/electron/mcp/tools/schema";
import { WRITE_TOOLS } from "../../../src/electron/mcp/tools/recordWrites";
import type { AgentToolContext, ResolvedConnection } from "../../../src/electron/mcp/types";

const conn: ResolvedConnection = {
  displayName: "A · Dev",
  auth: { id: "id", envUrl: "https://a", crmType: "online", token: "t" },
  allowsChanges: false,
};

function ctx(callSidecar: (...a: unknown[]) => unknown): AgentToolContext {
  return {
    resolveConnection: async () => conn,
    callSidecar: callSidecar as AgentToolContext["callSidecar"],
    listConnections: () => [],
    signal: new AbortController().signal,
  };
}

type EffectFn = (args: Record<string, unknown>, ctx: AgentToolContext) => Promise<string> | string;
const effectOf = (t: { effect: unknown }) => t.effect as EffectFn;

const registry = createAgentToolRegistry([...READ_TOOLS, ...WRITE_TOOLS, ...SCHEMA_TOOLS]);
const tool = (name: string) => registry.get(name)!;

describe("schema tools", () => {
  it("builds a valid registry", () => {
    expect(registry.list().length).toBeGreaterThan(14);
  });

  it.each([
    "schema_create_table",
    "schema_create_column",
    "schema_create_lookup",
    "schema_create_many_to_many",
    "schema_create_choice",
    "schema_add_choice_option",
  ])("%s is a change that says so", (name) => {
    expect(tool(name).effect).toBe("change");
    expect(tool(name).description).toContain("Changes the environment.");
    expect(tool(name).group).toBe("schema");
  });

  it("describes each call for the approval dialog", () => {
    expect(tool("schema_create_column").describe!({ table: "account", schemaName: "new_rating" }).summary).toBe(
      "create column new_rating on account",
    );
    expect(tool("schema_create_table").describe!({ schemaName: "new_project" }).summary).toBe("create table new_project");
    expect(tool("schema_create_lookup").describe!({ table: "contact", schemaName: "new_parent" }).summary).toBe(
      "create lookup new_parent on contact",
    );
    expect(tool("schema_create_many_to_many").describe!({ schemaName: "new_a_b" }).summary).toBe("create many-to-many relationship new_a_b");
    expect(tool("schema_create_choice").describe!({ schemaName: "new_colors" }).summary).toBe("create choice new_colors");
    expect(tool("schema_add_choice_option").describe!({ choice: "new_colors", label: "Red" }).summary).toBe(
      'add the option "Red" to new_colors',
    );
    expect(tool("schema_add_choice_option").describe!({ table: "account", column: "new_rating", label: "Hot" }).summary).toBe(
      'add the option "Hot" to account.new_rating',
    );
  });

  it("rejects a bad column type and a bad table name, naming the field", () => {
    const column = tool("schema_create_column");
    const bad = registry.validate(column, { table: "account", schemaName: "new_x", displayName: "X", type: "nonsense" });
    expect(bad).toEqual({ ok: false, message: expect.stringContaining("type") });
    const badTable = registry.validate(column, { table: "Bad Table", schemaName: "new_x", displayName: "X", type: "text" });
    expect(badTable).toEqual({ ok: false, message: expect.stringContaining("table") });
    expect(registry.validate(column, { table: "account", schemaName: "new_x", displayName: "X", type: "text" }).ok).toBe(true);
  });

  it("limits lookup targets to 1 to 10 and choice options to 1 to 400", () => {
    const lookup = tool("schema_create_lookup");
    const base = { table: "contact", schemaName: "new_p", displayName: "P" };
    expect(registry.validate(lookup, { ...base, targets: [] }).ok).toBe(false);
    expect(registry.validate(lookup, { ...base, targets: Array.from({ length: 11 }, (_, i) => `t${i}`) }).ok).toBe(false);
    expect(registry.validate(lookup, { ...base, targets: ["account"] }).ok).toBe(true);
    const choice = tool("schema_create_choice");
    expect(registry.validate(choice, { schemaName: "new_c", displayName: "C", options: [] }).ok).toBe(false);
    expect(registry.validate(choice, { schemaName: "new_c", displayName: "C", options: [{ label: "A" }] }).ok).toBe(true);
  });

  it("posts the arguments, without the connection, to the agent route", async () => {
    const call = vi.fn(async () => ({ logicalName: "new_project", metadataId: "id" }));
    const args = { connection: "A · Dev", schemaName: "new_project", displayName: "Project", pluralName: "Projects", ownership: "user", solution: "Core" };
    const result = await tool("schema_create_table").run(args, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "POST", "/api/agent/schema/tables", {
      schemaName: "new_project",
      displayName: "Project",
      pluralName: "Projects",
      ownership: "user",
      solution: "Core",
    });
    expect(result.structuredContent).toMatchObject({ connection: "A · Dev", result: { logicalName: "new_project" } });
  });

  it("uses the route for each tool", async () => {
    const routes: Record<string, string> = {
      schema_create_column: "/api/agent/schema/columns",
      schema_create_lookup: "/api/agent/schema/lookups",
      schema_create_many_to_many: "/api/agent/schema/many-to-many",
      schema_create_choice: "/api/agent/schema/choices",
      schema_add_choice_option: "/api/agent/schema/choices/options",
    };
    for (const [name, route] of Object.entries(routes)) {
      const call = vi.fn(async () => ({}));
      await tool(name).run({ x: 1 }, ctx(call));
      expect(call).toHaveBeenCalledWith(conn, "POST", route, { x: 1 });
    }
  });
});

describe("metadata_get_choices with a global choice", () => {
  const get = tool("metadata_get_choices");

  it("reads a global choice by name", async () => {
    const call = vi.fn(async () => [{ value: 1, label: "Red" }]);
    const result = await get.run({ choice: "new_colors" }, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "GET", "/api/agent/metadata/choices/new_colors");
    expect(result.structuredContent).toMatchObject({ choices: [{ value: 1, label: "Red" }] });
  });

  it("still reads a column's choices", async () => {
    const call = vi.fn(async () => []);
    await get.run({ table: "account", column: "statuscode" }, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "GET", "/api/community-tools/metadata/tables/account/columns/statuscode/choices");
  });

  it("needs a choice, or a table and a column", async () => {
    await expect(get.run({ table: "account" }, ctx(vi.fn()))).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(get.run({}, ctx(vi.fn()))).rejects.toMatchObject({ code: "InvalidRequest" });
    await expect(get.run({ choice: "x", table: "account", column: "c" }, ctx(vi.fn()))).rejects.toMatchObject({ code: "InvalidRequest" });
  });
});

describe("schema_update_column", () => {
  const update = tool("schema_update_column");
  const columnInfo = (maxLength: number | null) =>
    vi.fn(async () => ({ type: "string", maxLength }));

  it("is destructive when maxLength drops from 200 to 100, and says what is lost", async () => {
    const call = columnInfo(200);
    const effect = await effectOf(update)({ table: "account", column: "new_title", maxLength: 100 }, ctx(call));
    expect(effect).toBe("destructive");
    expect(call).toHaveBeenCalledWith(conn, "GET", "/api/agent/metadata/tables/account/columns/new_title");
    expect(update.describe!({ table: "account", column: "new_title", maxLength: 100 }).removes).toBe(
      "values longer than 100 characters in account.new_title",
    );
  });

  it("is a change when maxLength goes from 200 to 300, or stays the same", async () => {
    const effect = effectOf(update);
    expect(await effect({ table: "account", column: "c", maxLength: 300 }, ctx(columnInfo(200)))).toBe("change");
    expect(await effect({ table: "account", column: "c", maxLength: 200 }, ctx(columnInfo(200)))).toBe("change");
  });

  it("is a change with no maxLength, and reads nothing", async () => {
    const call = columnInfo(200);
    expect(await effectOf(update)({ table: "account", column: "c", displayName: "X" }, ctx(call))).toBe("change");
    expect(call).not.toHaveBeenCalled();
  });

  it("is a change when the column has no current length to compare", async () => {
    expect(await effectOf(update)({ table: "account", column: "c", maxLength: 10 }, ctx(columnInfo(null)))).toBe("change");
  });

  it("lets a failed lookup fail the call instead of guessing", async () => {
    const failing = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(effectOf(update)({ table: "account", column: "c", maxLength: 10 }, ctx(failing))).rejects.toThrow("boom");
  });

  it("posts to the update route", async () => {
    const call = vi.fn(async () => ({ logicalName: "new_title" }));
    await update.run({ table: "account", column: "new_title", maxLength: 300 }, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "POST", "/api/agent/schema/columns/update", { table: "account", column: "new_title", maxLength: 300 });
  });
});

describe("schema_publish", () => {
  const publish = tool("schema_publish");

  it("is a change that publishes everything when no tables are given", async () => {
    expect(publish.effect).toBe("change");
    expect(publish.describe!({}).summary).toBe("publish all customizations");
    const call = vi.fn(async () => ({ published: "all" }));
    await publish.run({}, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "POST", "/api/agent/schema/publish", {});
  });

  it("names the tables it publishes", async () => {
    expect(publish.describe!({ tables: ["account", "contact"] }).summary).toBe("publish account, contact");
    const call = vi.fn(async () => ({}));
    await publish.run({ tables: ["account"] }, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "POST", "/api/agent/schema/publish", { tables: ["account"] });
  });
});

describe("forms and views", () => {
  const GUID = "11111111-1111-1111-1111-111111111111";

  it("lists forms and views as reads with the table in the query", async () => {
    for (const [name, key, route] of [
      ["metadata_list_forms", "forms", "forms"],
      ["metadata_list_views", "views", "views"],
    ] as const) {
      const t = tool(name);
      expect(t.effect).toBe("read");
      expect(t.description).toContain("Read-only.");
      const call = vi.fn(async () => [{ id: GUID }]);
      const result = await t.run({ table: "account" }, ctx(call));
      expect(call).toHaveBeenCalledWith(conn, "GET", `/api/agent/metadata/${route}?table=account`);
      expect(result.structuredContent).toMatchObject({ [key]: [{ id: GUID }] });
      expect(result._meta).toMatchObject({ "powertools/untrusted": true });
    }
  });

  it("adds columns to forms and views as changes, with summaries", async () => {
    const form = tool("schema_add_column_to_form");
    const view = tool("schema_add_column_to_view");
    expect(form.effect).toBe("change");
    expect(view.effect).toBe("change");
    expect(form.describe!({ table: "account", column: "new_rating" }).summary).toBe("add column new_rating to a account form");
    expect(view.describe!({ table: "account", column: "new_rating" }).summary).toBe("add column new_rating to a account view");
    const call = vi.fn(async () => ({ id: GUID, column: "new_rating" }));
    await form.run({ connection: "A · Dev", table: "account", formId: GUID, column: "new_rating", section: "notes" }, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "POST", "/api/agent/schema/forms/add-column", {
      table: "account",
      formId: GUID,
      column: "new_rating",
      section: "notes",
    });
  });

  it("rejects a form id that is not a GUID and a width out of range", () => {
    expect(registry.validate(tool("schema_add_column_to_form"), { table: "account", formId: "nope", column: "c" }).ok).toBe(false);
    expect(registry.validate(tool("schema_add_column_to_view"), { table: "account", viewId: GUID, column: "c", width: 5 }).ok).toBe(false);
    expect(registry.validate(tool("schema_add_column_to_view"), { table: "account", viewId: GUID, column: "c", width: 200 }).ok).toBe(true);
  });
});
