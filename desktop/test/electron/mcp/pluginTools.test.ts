import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAgentToolRegistry } from "../../../src/electron/mcp/registry";
import { createPluginTools, MAX_ASSEMBLY_BYTES, validateAssemblyPath, type PluginFiles } from "../../../src/electron/mcp/tools/plugins";
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

const DLL = resolve("/work/Contoso.Plugins.dll");
const GUID = "11111111-1111-1111-1111-111111111111";

function fakeFiles(options: { size?: number; isFile?: boolean; missing?: boolean; bytes?: Buffer } = {}) {
  const bytes = options.bytes ?? Buffer.from([0x4d, 0x5a, 1, 2, 3]);
  const files: PluginFiles = {
    stat: vi.fn(async () => {
      if (options.missing) throw new Error("ENOENT");
      return { size: options.size ?? bytes.length, isFile: () => options.isFile ?? true };
    }),
    readFile: vi.fn(async () => bytes),
  };
  return { files, bytes };
}

function tools(files: PluginFiles) {
  const list = createPluginTools(files);
  const registry = createAgentToolRegistry(list);
  return { list, registry, tool: (name: string) => registry.get(name)! };
}

type EffectFn = (args: Record<string, unknown>, ctx: AgentToolContext) => Promise<string> | string;
const effectOf = (t: { effect: unknown }) => t.effect as EffectFn;

describe("plug-in assembly path rules", () => {
  it.each([
    ["a relative path", "Contoso.Plugins.dll", () => fakeFiles()],
    ["a missing file", DLL, () => fakeFiles({ missing: true })],
    ["an .exe", resolve("/work/tool.exe"), () => fakeFiles()],
    ["a directory", DLL, () => fakeFiles({ isFile: false })],
    ["a file over 16 MB", DLL, () => fakeFiles({ size: MAX_ASSEMBLY_BYTES + 1 })],
    ["an empty file", DLL, () => fakeFiles({ size: 0 })],
  ])("rejects %s as InvalidRequest without reading the file", async (_label, path, make) => {
    const { files } = make();
    await expect(validateAssemblyPath(path, files)).rejects.toMatchObject({ code: "InvalidRequest" });
    expect(files.readFile).not.toHaveBeenCalled();
  });

  it("rejects a path that is not a string", async () => {
    await expect(validateAssemblyPath(5, fakeFiles().files)).rejects.toMatchObject({ code: "InvalidRequest" });
  });

  it("accepts an absolute .dll of at most 16 MB, in any case, with a stat only", async () => {
    const { files } = fakeFiles({ size: MAX_ASSEMBLY_BYTES });
    expect(await validateAssemblyPath(resolve("/work/Contoso.DLL"), files)).toBe(resolve("/work/Contoso.DLL"));
    expect(files.stat).toHaveBeenCalledTimes(1);
    expect(files.readFile).not.toHaveBeenCalled();
  });

  it("checks the path in the effect, before the user could be asked, for both assembly tools", async () => {
    const { files } = fakeFiles({ missing: true });
    const { tool } = tools(files);
    for (const name of ["plugins_register_assembly", "plugins_update_assembly"]) {
      await expect(effectOf(tool(name))({ path: DLL, id: GUID }, ctx(vi.fn()))).rejects.toMatchObject({ code: "InvalidRequest" });
    }
    expect(files.readFile).not.toHaveBeenCalled();
  });
});

describe("plug-in tools", () => {
  it("builds a valid registry with ten tools", () => {
    expect(tools(fakeFiles().files).registry.list()).toHaveLength(10);
  });

  it.each(["plugins_list", "plugins_get_step_options"])("%s is a read", (name) => {
    const { tool } = tools(fakeFiles().files);
    expect(tool(name).effect).toBe("read");
    expect(tool(name).description).toContain("Read-only.");
    expect(tool(name).group).toBe("plugins");
  });

  it.each([
    "plugins_register_step",
    "plugins_update_step",
    "plugins_set_step_state",
    "plugins_register_image",
    "plugins_update_image",
  ])("%s is a change", (name) => {
    const { tool } = tools(fakeFiles().files);
    expect(tool(name).effect).toBe("change");
    expect(tool(name).description).toContain("Changes the environment.");
  });

  it("registers an assembly as a change once the path checks out", async () => {
    const { files } = fakeFiles();
    const { tool } = tools(files);
    expect(await effectOf(tool("plugins_register_assembly"))({ path: DLL }, ctx(vi.fn()))).toBe("change");
    expect(tool("plugins_register_assembly").describe!({ path: DLL }).summary).toBe("register the plug-in assembly Contoso.Plugins.dll");
  });

  it("reads the file only when it runs, and sends its name and base64 content", async () => {
    const { files, bytes } = fakeFiles();
    const { tool } = tools(files);
    const call = vi.fn(async () => ({ id: GUID }));

    await tool("plugins_register_assembly").run({ connection: "A · Dev", path: DLL, solution: "Core" }, ctx(call));

    expect(files.readFile).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith(conn, "POST", "/api/agent/plugins/assemblies", {
      fileName: "Contoso.Plugins.dll",
      contentBase64: bytes.toString("base64"),
      solution: "Core",
    });
  });

  it("makes plugins_update_assembly destructive and says what is replaced", async () => {
    const { files } = fakeFiles();
    const { tool, registry } = tools(files);
    const update = tool("plugins_update_assembly");
    expect(update.effect).toBeTypeOf("function");
    expect(await effectOf(update)({ id: GUID, path: DLL }, ctx(vi.fn()))).toBe("destructive");
    expect(update.description).toContain("Destructive:");
    expect(update.describe!({ id: GUID, path: DLL }).removes).toBe("the current code of assembly Contoso.Plugins");
    expect(registry.list().find((t) => t.name === "plugins_update_assembly")).toBeDefined();
    const call = vi.fn(async () => ({}));
    await update.run({ id: GUID, path: DLL }, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "POST", `/api/agent/plugins/assemblies/${GUID}/update`, {
      fileName: "Contoso.Plugins.dll",
      contentBase64: expect.any(String),
    });
  });

  it("makes plugins_unregister a destructive constant", async () => {
    const { tool, registry } = tools(fakeFiles().files);
    const unregister = tool("plugins_unregister");
    expect(unregister.effect).toBe("destructive");
    expect(registry.list().find((t) => t.name === "plugins_unregister")!.annotations?.destructiveHint).toBe(true);
    expect(unregister.describe!({ kind: "step", id: GUID }).removes).toBe(`the plug-in step ${GUID}`);
    const call = vi.fn(async () => ({}));
    await unregister.run({ connection: "A · Dev", kind: "step", id: GUID }, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "POST", "/api/agent/plugins/unregister", { kind: "step", id: GUID });
  });

  it("lists with filters in the query and marks the result untrusted", async () => {
    const { tool } = tools(fakeFiles().files);
    const call = vi.fn(async () => ({ assemblies: [] }));
    const result = await tool("plugins_list").run({ assembly: "Contoso", table: "account", message: "Create" }, ctx(call));
    expect(call).toHaveBeenCalledWith(conn, "GET", "/api/agent/plugins/catalog?assembly=Contoso&table=account&message=Create");
    expect(result._meta).toMatchObject({ "powertools/untrusted": true });
    await tool("plugins_list").run({}, ctx(call));
    expect(call).toHaveBeenLastCalledWith(conn, "GET", "/api/agent/plugins/catalog");
  });

  it("posts step and image changes to their routes without the id in the body", async () => {
    const { tool } = tools(fakeFiles().files);
    const step = { name: "S", pluginTypeId: GUID, messageId: GUID, stage: 20, mode: 0 };
    const call = vi.fn(async () => ({}));
    await tool("plugins_register_step").run({ ...step, solution: "Core" }, ctx(call));
    expect(call).toHaveBeenLastCalledWith(conn, "POST", "/api/agent/plugins/steps", { ...step, solution: "Core" });
    await tool("plugins_update_step").run({ id: GUID, ...step }, ctx(call));
    expect(call).toHaveBeenLastCalledWith(conn, "POST", `/api/agent/plugins/steps/${GUID}/update`, step);
    await tool("plugins_set_step_state").run({ id: GUID, enabled: false }, ctx(call));
    expect(call).toHaveBeenLastCalledWith(conn, "POST", `/api/agent/plugins/steps/${GUID}/state`, { enabled: false });
    expect(tool("plugins_set_step_state").describe!({ id: GUID, enabled: false }).summary).toBe("disable a plug-in step");
    const image = { stepId: GUID, name: "pre", entityAlias: "pre", imageType: 0 };
    await tool("plugins_register_image").run(image, ctx(call));
    expect(call).toHaveBeenLastCalledWith(conn, "POST", "/api/agent/plugins/images", image);
    await tool("plugins_update_image").run({ id: GUID, ...image }, ctx(call));
    expect(call).toHaveBeenLastCalledWith(conn, "POST", `/api/agent/plugins/images/${GUID}/update`, image);
  });

  it("mirrors the step draft schema: required fields, enums and ids", () => {
    const { tool, registry } = tools(fakeFiles().files);
    const register = tool("plugins_register_step");
    const ok = { name: "S", pluginTypeId: GUID, messageId: GUID, stage: 20, mode: 0 };
    expect(registry.validate(register, ok).ok).toBe(true);
    expect(registry.validate(register, { ...ok, stage: 30 }).ok).toBe(false);
    expect(registry.validate(register, { ...ok, mode: 2 }).ok).toBe(false);
    expect(registry.validate(register, { ...ok, pluginTypeId: "nope" }).ok).toBe(false);
    expect(registry.validate(register, { ...ok, secureConfigurationAction: "wipe" }).ok).toBe(false);
    expect(registry.validate(register, { name: "S" }).ok).toBe(false);
    expect(registry.validate(tool("plugins_register_image"), { stepId: GUID, name: "n", entityAlias: "a", imageType: 3 }).ok).toBe(false);
    expect(registry.validate(tool("plugins_unregister"), { kind: "solution", id: GUID }).ok).toBe(false);
  });
});
