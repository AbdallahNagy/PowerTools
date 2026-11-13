import { describe, expect, it, vi } from "vitest";
import { createAgentToolRegistry } from "../../../src/electron/mcp/registry";
import { SOLUTION_TOOLS } from "../../../src/electron/mcp/tools/solutions";
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

const registry = createAgentToolRegistry(SOLUTION_TOOLS);
const tool = (name: string) => registry.get(name)!;
const GUID = "11111111-1111-1111-1111-111111111111";

describe("solution tools", () => {
  it("builds a valid registry", () => {
    expect(registry.list()).toHaveLength(11);
  });

  it.each(["solutions_list", "solutions_list_components", "solutions_list_publishers", "solutions_list_layers"])(
    "%s is a read",
    (name) => {
      expect(tool(name).effect).toBe("read");
      expect(tool(name).description).toContain("Read-only.");
      expect(tool(name).group).toBe("solutions");
    },
  );

  it.each(["solutions_create", "solutions_create_patch", "solutions_add_component"])("%s is a change", (name) => {
    expect(tool(name).effect).toBe("change");
    expect(tool(name).description).toContain("Changes the environment.");
  });

  it.each(["solutions_remove_component", "solutions_clone", "solutions_remove_active_layer"])(
    "%s is a destructive constant that says what it removes",
    (name) => {
      expect(tool(name).effect).toBe("destructive");
      expect(tool(name).description).toContain("Destructive:");
      const described = tool(name).describe!({ solution: "Core", componentType: "form", componentId: GUID, version: "2.0.0.0" });
      expect(described.removes).toBeTruthy();
      expect(registry.list().find((t) => t.name === name)!.annotations?.destructiveHint).toBe(true);
    },
  );

  it("describes a clone with the patches it removes", () => {
    expect(tool("solutions_clone").describe!({ solution: "Core", version: "2.0.0.0" })).toEqual({
      summary: "clone solution Core as version 2.0.0.0",
      removes: "the patches of Core; they are rolled up into the new version",
    });
  });

  it("reads through the agent routes with a query string", async () => {
    const call = vi.fn(async () => []);
    await tool("solutions_list").run({ unmanagedOnly: true }, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "GET", "/api/agent/solutions?unmanagedOnly=true");
    await tool("solutions_list").run({}, ctx(call));
    expect(call).toHaveBeenLastCalledWith(conn, "GET", "/api/agent/solutions");
    await tool("solutions_list_components").run({ solution: "My Sol", componentType: 60 }, ctx(call));
    expect(call).toHaveBeenLastCalledWith(conn, "GET", "/api/agent/solutions/My%20Sol/components?componentType=60");
    await tool("solutions_list_publishers").run({}, ctx(call));
    expect(call).toHaveBeenLastCalledWith(conn, "GET", "/api/agent/metadata/publishers");
    await tool("solutions_list_layers").run({ componentType: 1, componentId: GUID }, ctx(call));
    expect(call).toHaveBeenLastCalledWith(conn, "GET", `/api/agent/solutions/layers?componentType=1&componentId=${GUID}`);
  });

  it("marks read results as untrusted", async () => {
    const result = await tool("solutions_list").run({}, ctx(async () => []));
    expect(result._meta).toMatchObject({ "powertools/untrusted": true });
  });

  it("posts writes to their routes without the connection", async () => {
    const routes: Array<[string, Record<string, unknown>, string]> = [
      ["solutions_create", { uniqueName: "Sales", displayName: "Sales", publisher: "new" }, "/api/agent/solutions"],
      ["solutions_create_patch", { solution: "Core" }, "/api/agent/solutions/patch"],
      ["solutions_add_component", { solution: "Core", componentType: "form", componentId: GUID }, "/api/agent/solutions/components/add"],
      ["solutions_remove_component", { solution: "Core", componentType: 26, componentId: GUID }, "/api/agent/solutions/components/remove"],
      ["solutions_clone", { solution: "Core", version: "2.0.0.0" }, "/api/agent/solutions/clone"],
      ["solutions_remove_active_layer", { componentType: 1, componentId: GUID }, "/api/agent/solutions/layers/remove-active"],
    ];
    for (const [name, args, route] of routes) {
      const call = vi.fn(async () => ({}));
      await tool(name).run({ ...args, connection: "A · Dev" }, ctx(call));
      expect(call).toHaveBeenCalledWith(conn, "POST", route, args);
    }
  });

  it("accepts a component type number or a known name, and rejects anything else", () => {
    const add = tool("solutions_add_component");
    const base = { solution: "Core", componentId: GUID };
    expect(registry.validate(add, { ...base, componentType: 60 }).ok).toBe(true);
    expect(registry.validate(add, { ...base, componentType: "envvar" }).ok).toBe(true);
    expect(registry.validate(add, { ...base, componentType: "nonsense" }).ok).toBe(false);
    expect(registry.validate(add, { ...base, componentType: 0 }).ok).toBe(false);
    expect(registry.validate(add, { ...base }).ok).toBe(false);
  });

  it("checks versions and ids", () => {
    expect(registry.validate(tool("solutions_clone"), { solution: "Core", version: "2.0" }).ok).toBe(false);
    expect(registry.validate(tool("solutions_clone"), { solution: "Core", version: "2.0.0.0" }).ok).toBe(true);
    expect(registry.validate(tool("solutions_create"), { uniqueName: "bad name", displayName: "x" }).ok).toBe(false);
    expect(registry.validate(tool("solutions_list_layers"), { componentType: 1, componentId: "nope" }).ok).toBe(false);
  });
});

describe("solution tool results", () => {
  it("flattens the component list", async () => {
    const call = vi.fn(async () => ({ components: [{ componentId: GUID, componentType: 80, typeName: "Model-driven App" }], truncated: false }));
    const result = await tool("solutions_list_components").run({ solution: "Core" }, ctx(call));
    expect(result.structuredContent).toMatchObject({ components: [{ componentType: 80 }], truncated: false });
  });

  it("leaves the layer JSON out unless asked", async () => {
    const layers = { componentId: GUID, layers: [{ order: 1, name: "Active", changes: "{...}", componentJson: "{...}" }] };
    const call = vi.fn(async () => layers);
    const lean = await tool("solutions_list_layers").run({ componentType: 26, componentId: GUID }, ctx(call));
    expect((lean.structuredContent as { layers: typeof layers }).layers.layers[0]).toEqual({ order: 1, name: "Active" });
    const full = await tool("solutions_list_layers").run({ componentType: 26, componentId: GUID, includeChanges: true }, ctx(call));
    expect((full.structuredContent as { layers: typeof layers }).layers).toEqual(layers);
  });

  it("deletes a solution as a destructive call", async () => {
    expect(tool("solutions_delete").effect).toBe("destructive");
    const call = vi.fn(async () => ({ uniqueName: "Core" }));
    await tool("solutions_delete").run({ solution: "Core" }, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "POST", "/api/agent/solutions/delete", { solution: "Core" });
  });
});
