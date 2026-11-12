import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { dataverseResult } from "../results.js";
import { AgentToolError, type AgentTool, type AgentToolContext } from "../types.js";
import { AGENT_API, connectionProp, postAgent, solutionProp } from "./schema.js";

export const MAX_ASSEMBLY_BYTES = 16 * 1024 * 1024;

const GUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const enc = encodeURIComponent;
const str = (value: unknown) => String(value);

export interface PluginFiles {
  stat(path: string): Promise<{ size: number; isFile(): boolean }>;
  readFile(path: string): Promise<Buffer>;
}

const NODE_FILES: PluginFiles = { stat, readFile };

function invalid(message: string, hint?: string): AgentToolError {
  return new AgentToolError("InvalidRequest", message, hint);
}

/**
 * Checks a plug-in assembly path with nothing more than a stat: an absolute path to an existing .dll file
 * of at most 16 MB. The file is not read here, so a bad path costs no I/O and never reaches the approval dialog.
 */
export async function validateAssemblyPath(path: unknown, files: PluginFiles = NODE_FILES): Promise<string> {
  if (typeof path !== "string" || !isAbsolute(path)) {
    throw invalid("path must be an absolute path to a .dll file", "Ask the user for the full path of the assembly.");
  }
  if (!path.toLowerCase().endsWith(".dll")) throw invalid("path must end in .dll");
  let info: Awaited<ReturnType<PluginFiles["stat"]>>;
  try {
    info = await files.stat(path);
  } catch {
    throw invalid("The assembly file does not exist or cannot be read", "Check the path with the user.");
  }
  if (!info.isFile()) throw invalid("path must be a file");
  if (info.size > MAX_ASSEMBLY_BYTES) throw invalid("The assembly is larger than 16 MB");
  if (info.size === 0) throw invalid("The assembly file is empty");
  return path;
}

async function readAssembly(path: unknown, files: PluginFiles): Promise<{ fileName: string; contentBase64: string }> {
  const valid = await validateAssemblyPath(path, files);
  const bytes = await files.readFile(valid);
  // The file may have changed since the check.
  if (bytes.length === 0 || bytes.length > MAX_ASSEMBLY_BYTES) throw invalid("The assembly must be from 1 byte to 16 MB");
  return { fileName: basename(valid), contentBase64: bytes.toString("base64") };
}

const idProp = (what: string) => ({ type: "string", pattern: GUID_PATTERN, description: `The GUID of the ${what}.` });
const pathProp = {
  type: "string",
  minLength: 1,
  description: "Absolute path of the compiled, strong-name signed assembly (.dll) on this computer. At most 16 MB.",
};

const stepProperties = {
  name: { type: "string", minLength: 1, maxLength: 256, description: "Step name." },
  pluginTypeId: idProp("plug-in type to run (from plugins_list)"),
  messageId: idProp("SDK message (from plugins_get_step_options)"),
  filterId: idProp("message filter, which picks the table (from plugins_get_step_options). Leave out for no filter"),
  stage: { type: "integer", enum: [10, 20, 40], description: "10 pre-validation, 20 pre-operation, 40 post-operation." },
  mode: { type: "integer", enum: [0, 1], description: "0 synchronous, 1 asynchronous." },
  rank: { type: "integer", minimum: 1, description: "Execution order. Default 1." },
  supportedDeployment: { type: "integer", enum: [0, 1, 2], description: "0 server, 1 offline, 2 both. Default 0." },
  asyncAutoDelete: { type: "boolean", description: "Delete the system job after a successful asynchronous run." },
  filteringAttributes: { type: "array", items: { type: "string" }, description: "Column logical names that trigger an update step." },
  impersonatingUserId: idProp("user to run as. Leave out to run as the calling user"),
  description: { type: "string", description: "Step description." },
  configuration: { type: "string", maxLength: 4096, description: "Unsecure configuration text." },
  secureConfigurationAction: { type: "string", enum: ["keep", "replace", "clear"], description: "What to do with the secure configuration. Default keep; clear is only for updates." },
  secureConfiguration: { type: "string", description: "New secure configuration, with action replace." },
};

const imageProperties = {
  name: { type: "string", minLength: 1, description: "Image name." },
  entityAlias: { type: "string", minLength: 1, description: "Alias the plug-in code reads the image by." },
  imageType: { type: "integer", enum: [0, 1, 2], description: "0 pre-image, 1 post-image, 2 both." },
  attributes: { type: "array", items: { type: "string" }, description: "Column logical names in the image. Leave empty for all." },
};

function plain(
  effect: AgentTool["effect"],
  tool: Pick<AgentTool, "name" | "title" | "description" | "inputSchema" | "describe" | "summarize"> & {
    route: (args: Record<string, unknown>) => string;
    done: string;
    body?: (args: Record<string, unknown>) => Record<string, unknown>;
  },
): AgentTool {
  const strip = (args: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(args).filter(([key]) => key !== "connection" && key !== "id"));
  return {
    name: tool.name,
    group: "plugins",
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    effect,
    describe: tool.describe,
    summarize: tool.summarize,
    async run(args, ctx) {
      const { conn, data } = await postAgent(args, ctx, tool.route(args), tool.body ? tool.body(args) : strip(args));
      return dataverseResult(tool.done, { result: data }, conn.displayName);
    },
  };
}

async function getAgent(args: Record<string, unknown>, ctx: AgentToolContext, path: string) {
  const conn = await ctx.resolveConnection(args.connection as string | undefined);
  return { conn, data: await ctx.callSidecar(conn, "GET", `${AGENT_API}${path}`) };
}

/** The plug-in tools. The file system is a parameter so the path rules can be tested without files. */
export function createPluginTools(files: PluginFiles = NODE_FILES): AgentTool[] {
  const pluginsList: AgentTool = {
    name: "plugins_list",
    group: "plugins",
    title: "List plug-ins",
    description:
      "Lists registered plug-in assemblies, types, steps and images. Narrow with assembly (name contains), table (primary table) or message. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        connection: connectionProp,
        assembly: { type: "string", description: "Keep assemblies whose name contains this text." },
        table: { type: "string", description: "Keep steps on this table (logical name)." },
        message: { type: "string", description: "Keep steps for this message, for example Create." },
      },
      additionalProperties: false,
    },
    effect: "read",
    summarize: () => "plugins_list",
    async run(args, ctx) {
      const pairs = (["assembly", "table", "message"] as const)
        .filter((key) => typeof args[key] === "string" && args[key] !== "")
        .map((key) => `${key}=${enc(str(args[key]))}`);
      const { conn, data } = await getAgent(args, ctx, `/plugins/catalog${pairs.length ? `?${pairs.join("&")}` : ""}`);
      return dataverseResult("Plug-in catalog.", { catalog: data }, conn.displayName);
    },
  };

  const pluginsStepOptions: AgentTool = {
    name: "plugins_get_step_options",
    group: "plugins",
    title: "Get step options",
    description: "Lists the SDK messages, message filters (tables) and users a plug-in step can use, with their ids. Read-only.",
    inputSchema: { type: "object", properties: { connection: connectionProp }, additionalProperties: false },
    effect: "read",
    summarize: () => "plugins_get_step_options",
    async run(args, ctx) {
      const { conn, data } = await getAgent(args, ctx, "/plugins/step-options");
      return dataverseResult("Step options.", { options: data }, conn.displayName);
    },
  };

  const registerAssembly: AgentTool = {
    name: "plugins_register_assembly",
    group: "plugins",
    title: "Register plug-in assembly",
    description:
      "Registers a plug-in assembly from a .dll on this computer (sandbox, database) and its plug-in types. Give solution to add it to one. Changes the environment.",
    inputSchema: {
      type: "object",
      properties: { connection: connectionProp, path: pathProp, solution: solutionProp },
      required: ["path"],
      additionalProperties: false,
    },
    // Checked before the user is asked: a bad path never reaches the dialog.
    effect: async (args): Promise<"change"> => {
      await validateAssemblyPath(args.path, files);
      return "change";
    },
    describe: (args) => ({ summary: `register the plug-in assembly ${basename(str(args.path))}` }),
    summarize: (args) => `plugins_register_assembly ${basename(str(args.path))}`,
    async run(args, ctx) {
      const file = await readAssembly(args.path, files);
      const { conn, data } = await postAgent(args, ctx, "/plugins/assemblies", {
        ...file,
        ...(args.solution !== undefined ? { solution: args.solution } : {}),
      });
      return dataverseResult("Assembly registered.", { result: data }, conn.displayName);
    },
  };

  const updateAssembly: AgentTool = {
    name: "plugins_update_assembly",
    group: "plugins",
    title: "Update plug-in assembly",
    description:
      "Destructive: replaces the code of a registered assembly with a .dll on this computer. Types missing from it are refused. Always asks the user.",
    inputSchema: {
      type: "object",
      properties: { connection: connectionProp, id: idProp("registered assembly (from plugins_list)"), path: pathProp },
      required: ["id", "path"],
      additionalProperties: false,
    },
    effect: async (args): Promise<"destructive"> => {
      await validateAssemblyPath(args.path, files);
      return "destructive";
    },
    describe: (args) => ({
      summary: `replace the code of the plug-in assembly ${basename(str(args.path))}`,
      removes: `the current code of assembly ${basename(str(args.path)).replace(/\.dll$/i, "")}`,
    }),
    summarize: (args) => `plugins_update_assembly ${basename(str(args.path))}`,
    async run(args, ctx) {
      const file = await readAssembly(args.path, files);
      const { conn, data } = await postAgent(args, ctx, `/plugins/assemblies/${enc(str(args.id))}/update`, file);
      return dataverseResult("Assembly updated.", { result: data }, conn.displayName);
    },
  };

  const registerStep = plain("change", {
    name: "plugins_register_step",
    title: "Register plug-in step",
    description: "Registers a plug-in step. Get ids from plugins_list and plugins_get_step_options. Give solution to add it to one. Changes the environment.",
    inputSchema: {
      type: "object",
      properties: { connection: connectionProp, ...stepProperties, solution: solutionProp },
      required: ["name", "pluginTypeId", "messageId", "stage", "mode"],
      additionalProperties: false,
    },
    route: () => "/plugins/steps",
    done: "Step registered.",
    describe: (args) => ({ summary: `register the plug-in step ${str(args.name)}` }),
    summarize: (args) => `plugins_register_step ${str(args.name)}`,
  });

  const updateStep = plain("change", {
    name: "plugins_update_step",
    title: "Update plug-in step",
    description: "Changes a plug-in step. Send the whole step, as for registering it. Changes the environment.",
    inputSchema: {
      type: "object",
      properties: { connection: connectionProp, id: idProp("step"), ...stepProperties },
      required: ["id", "name", "pluginTypeId", "messageId", "stage", "mode"],
      additionalProperties: false,
    },
    route: (args) => `/plugins/steps/${enc(str(args.id))}/update`,
    done: "Step updated.",
    describe: (args) => ({ summary: `update the plug-in step ${str(args.name)}` }),
    summarize: (args) => `plugins_update_step ${str(args.name)}`,
  });

  const setStepState = plain("change", {
    name: "plugins_set_step_state",
    title: "Enable or disable plug-in step",
    description: "Enables or disables a plug-in step. Changes the environment.",
    inputSchema: {
      type: "object",
      properties: { connection: connectionProp, id: idProp("step"), enabled: { type: "boolean", description: "true to enable, false to disable." } },
      required: ["id", "enabled"],
      additionalProperties: false,
    },
    route: (args) => `/plugins/steps/${enc(str(args.id))}/state`,
    done: "Step state changed.",
    describe: (args) => ({ summary: `${args.enabled === true ? "enable" : "disable"} a plug-in step` }),
    summarize: (args) => `plugins_set_step_state (${args.enabled === true ? "enable" : "disable"})`,
  });

  const registerImage = plain("change", {
    name: "plugins_register_image",
    title: "Register step image",
    description: "Registers a pre or post image on a plug-in step. Changes the environment.",
    inputSchema: {
      type: "object",
      properties: { connection: connectionProp, stepId: idProp("step"), ...imageProperties },
      required: ["stepId", "name", "entityAlias", "imageType"],
      additionalProperties: false,
    },
    route: () => "/plugins/images",
    done: "Image registered.",
    describe: (args) => ({ summary: `register the step image ${str(args.name)}` }),
    summarize: (args) => `plugins_register_image ${str(args.name)}`,
  });

  const updateImage = plain("change", {
    name: "plugins_update_image",
    title: "Update step image",
    description: "Changes a step image. Send the whole image. Changes the environment.",
    inputSchema: {
      type: "object",
      properties: { connection: connectionProp, id: idProp("image"), stepId: idProp("step"), ...imageProperties },
      required: ["id", "stepId", "name", "entityAlias", "imageType"],
      additionalProperties: false,
    },
    route: (args) => `/plugins/images/${enc(str(args.id))}/update`,
    done: "Image updated.",
    describe: (args) => ({ summary: `update the step image ${str(args.name)}` }),
    summarize: (args) => `plugins_update_image ${str(args.name)}`,
  });

  const unregister = plain("destructive", {
    name: "plugins_unregister",
    title: "Unregister plug-in component",
    description: "Destructive: unregisters an assembly, plug-in type, step or image. Assemblies with steps are refused. It cannot be undone. Always asks the user.",
    inputSchema: {
      type: "object",
      properties: {
        connection: connectionProp,
        kind: { type: "string", enum: ["assembly", "type", "step", "image"], description: "What to unregister." },
        id: idProp("component (from plugins_list)"),
      },
      required: ["kind", "id"],
      additionalProperties: false,
    },
    route: () => "/plugins/unregister",
    body: (args) => ({ kind: args.kind, id: args.id }),
    done: "Unregistered.",
    describe: (args) => ({
      summary: `unregister the plug-in ${str(args.kind)} ${str(args.id)}`,
      removes: `the plug-in ${str(args.kind)} ${str(args.id)}${args.kind === "assembly" || args.kind === "type" ? " and its registered types" : ""}`,
    }),
    summarize: (args) => `plugins_unregister ${str(args.kind)}`,
  });

  return [
    pluginsList,
    pluginsStepOptions,
    registerAssembly,
    registerStep,
    updateStep,
    setStepState,
    registerImage,
    updateImage,
    updateAssembly,
    unregister,
  ];
}

export const PLUGIN_TOOLS: AgentTool[] = createPluginTools();
