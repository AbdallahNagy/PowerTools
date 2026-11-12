import { describe, expect, it, vi } from "vitest";
import { createAgentToolRegistry } from "../../../src/electron/mcp/registry";
import { ENVVAR_TOOLS } from "../../../src/electron/mcp/tools/envvars";
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

const registry = createAgentToolRegistry(ENVVAR_TOOLS);
const tool = (name: string) => registry.get(name)!;

describe("environment variable tools", () => {
  it("builds a valid registry in the envvars group", () => {
    expect(registry.list()).toHaveLength(4);
    expect(ENVVAR_TOOLS.every((t) => t.group === "envvars")).toBe(true);
  });

  it("lists as a read, and marks the result untrusted", async () => {
    const list = tool("envvars_list");
    expect(list.effect).toBe("read");
    expect(list.description).toContain("Read-only.");
    const call = vi.fn(async () => []);
    const result = await list.run({}, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "GET", "/api/agent/envvars");
    expect(result._meta).toMatchObject({ "powertools/untrusted": true });
  });

  it.each(["envvars_create_definition", "envvars_set_value"])("%s is a change", (name) => {
    expect(tool(name).effect).toBe("change");
    expect(tool(name).description).toContain("Changes the environment.");
  });

  it("makes envvars_delete a destructive constant that says what goes", () => {
    const del = tool("envvars_delete");
    expect(del.effect).toBe("destructive");
    expect(del.description).toContain("Destructive:");
    expect(registry.list().find((t) => t.name === "envvars_delete")!.annotations?.destructiveHint).toBe(true);
    expect(del.describe!({ kind: "definition", schemaName: "new_ApiUrl" })).toEqual({
      summary: "delete the environment variable new_ApiUrl",
      removes: "the environment variable new_ApiUrl and its values",
    });
    expect(del.describe!({ kind: "value", schemaName: "new_ApiUrl" }).removes).toBe("the current value of environment variable new_ApiUrl");
  });

  it("posts to the routes without the connection", async () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ["envvars_create_definition", { schemaName: "new_Timeout", displayName: "Timeout", type: "number", solution: "Core" }, "/api/agent/envvars/definitions"],
      ["envvars_set_value", { definition: "new_Timeout", value: "30" }, "/api/agent/envvars/values"],
      ["envvars_delete", { kind: "value", schemaName: "new_Timeout" }, "/api/agent/envvars/delete"],
    ];
    for (const [name, args, route] of cases) {
      const call = vi.fn(async () => ({}));
      await tool(name).run({ ...args, connection: "A · Dev" }, ctx(call));
      expect(call).toHaveBeenCalledWith(conn, "POST", route, args);
    }
  });

  it("keeps values out of the activity summary", () => {
    expect(tool("envvars_set_value").summarize!({ definition: "new_Key", value: "super-secret" })).toBe("envvars_set_value new_Key");
  });

  it("checks types, kinds and lengths", () => {
    const create = tool("envvars_create_definition");
    const ok = { schemaName: "new_X", displayName: "X", type: "string" };
    expect(registry.validate(create, ok).ok).toBe(true);
    expect(registry.validate(create, { ...ok, type: "datasource" }).ok).toBe(false);
    expect(registry.validate(create, { ...ok, defaultValue: "x".repeat(2001) }).ok).toBe(false);
    expect(registry.validate(tool("envvars_delete"), { kind: "everything", schemaName: "new_X" }).ok).toBe(false);
    expect(registry.validate(tool("envvars_set_value"), { definition: "new_X" }).ok).toBe(false);
  });
});
