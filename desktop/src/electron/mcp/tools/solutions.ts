import { dataverseResult } from "../results.js";
import type { AgentTool, AgentToolContext } from "../types.js";
import { AGENT_API, connectionProp, postAgent } from "./schema.js";

const GUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const VERSION_PATTERN = "^\\d+\\.\\d+\\.\\d+\\.\\d+$";
const enc = encodeURIComponent;
const str = (value: unknown) => String(value);

const solutionProp = { type: "string", minLength: 1, description: "Unique name of the solution." };
const NAMED_TYPES = ["table", "column", "form", "view", "pluginassembly", "pluginstep", "envvar"];
const componentTypeProp = {
  description: `The component type: a component type number, or one of ${NAMED_TYPES.join(", ")}.`,
  oneOf: [
    { type: "integer", minimum: 1 },
    { type: "string", enum: NAMED_TYPES },
  ],
};
const componentIdProp = { type: "string", pattern: GUID_PATTERN, description: "The component's GUID." };
const tableProp = { type: "string", pattern: "^[a-z_][a-z0-9_]*$", description: "Table logical name, to find a table or column component by name." };
const columnProp = { type: "string", pattern: "^[a-z_][a-z0-9_]*$", description: "Column logical name, with table, to find a column component by name." };

async function getAgent(args: Record<string, unknown>, ctx: AgentToolContext, path: string) {
  const conn = await ctx.resolveConnection(args.connection as string | undefined);
  const data = await ctx.callSidecar(conn, "GET", `${AGENT_API}${path}`);
  return { conn, data };
}

function read(
  tool: Pick<AgentTool, "name" | "title" | "description" | "inputSchema" | "summarize"> & {
    path: (args: Record<string, unknown>) => string;
    key: string;
  },
): AgentTool {
  return {
    name: tool.name,
    group: "solutions",
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    effect: "read",
    summarize: tool.summarize,
    async run(args, ctx) {
      const { conn, data } = await getAgent(args, ctx, tool.path(args));
      return dataverseResult(`${tool.title}.`, { [tool.key]: data }, conn.displayName);
    },
  };
}

function write(
  effect: "change" | "destructive",
  tool: Pick<AgentTool, "name" | "title" | "description" | "inputSchema" | "describe" | "summarize" | "reportsProgress"> & {
    route: string;
    done: string;
  },
): AgentTool {
  return {
    name: tool.name,
    group: "solutions",
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    effect,
    reportsProgress: tool.reportsProgress,
    describe: tool.describe,
    summarize: tool.summarize,
    async run(args, ctx) {
      const { conn, data } = await postAgent(args, ctx, tool.route);
      return dataverseResult(tool.done, { result: data }, conn.displayName);
    },
  };
}

const query = (pairs: Record<string, unknown>) => {
  const parts = Object.entries(pairs)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${enc(str(value))}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
};

export const solutionsList = read({
  name: "solutions_list",
  title: "List solutions",
  description: "Lists solutions with unique name, display name, version, publisher, and whether each is managed or a patch. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      unmanagedOnly: { type: "boolean", description: "Only unmanaged solutions. Default false." },
    },
    additionalProperties: false,
  },
  path: (args) => `/solutions${query({ unmanagedOnly: args.unmanagedOnly })}`,
  key: "solutions",
  summarize: () => "solutions_list",
});

export const solutionsListComponents = read({
  name: "solutions_list_components",
  title: "List solution components",
  description: "Lists the components of a solution (up to 500) with component type and id. Filter with componentType. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      solution: solutionProp,
      componentType: { type: "integer", minimum: 1, description: "Only components of this component type number." },
    },
    required: ["solution"],
    additionalProperties: false,
  },
  path: (args) => `/solutions/${enc(str(args.solution))}/components${query({ componentType: args.componentType })}`,
  key: "components",
  summarize: (args) => `solutions_list_components ${str(args.solution)}`,
});

export const solutionsListPublishers = read({
  name: "solutions_list_publishers",
  title: "List publishers",
  description: "Lists publishers with unique name, friendly name and customization prefix. Use before creating a solution or components. Read-only.",
  inputSchema: { type: "object", properties: { connection: connectionProp }, additionalProperties: false },
  path: () => "/metadata/publishers",
  key: "publishers",
  summarize: () => "solutions_list_publishers",
});

export const solutionsListLayers = read({
  name: "solutions_list_layers",
  title: "List solution layers",
  description: "Lists the solution layers of one component, top layer first, and whether the Active layer can be removed. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      componentType: { type: "integer", minimum: 1, description: "Component type number." },
      componentId: componentIdProp,
    },
    required: ["componentType", "componentId"],
    additionalProperties: false,
  },
  path: (args) => `/solutions/layers${query({ componentType: args.componentType, componentId: args.componentId })}`,
  key: "layers",
  summarize: () => "solutions_list_layers",
});

export const solutionsCreate = write("change", {
  name: "solutions_create",
  title: "Create solution",
  description: "Creates an unmanaged solution under a publisher (unique name or prefix; see solutions_list_publishers). Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      uniqueName: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]*$", description: "Unique name: letters, digits and underscores." },
      displayName: { type: "string", minLength: 1, description: "Display name." },
      publisher: { type: "string", minLength: 1, description: "Publisher unique name or customization prefix." },
      version: { type: "string", pattern: VERSION_PATTERN, description: "Version, for example 1.0.0.0. Default 1.0.0.0." },
      description: { type: "string", description: "Description." },
    },
    required: ["uniqueName", "displayName"],
    additionalProperties: false,
  },
  route: "/solutions",
  done: "Solution created.",
  describe: (args) => ({ summary: `create solution ${str(args.uniqueName)}` }),
  summarize: (args) => `solutions_create ${str(args.uniqueName)}`,
});

export const solutionsCreatePatch = write("change", {
  name: "solutions_create_patch",
  reportsProgress: true,
  title: "Create solution patch",
  description: "Creates a patch of an unmanaged solution. The version defaults to one build above the parent and its patches. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      solution: solutionProp,
      displayName: { type: "string", description: "Display name of the patch. Default the parent's." },
      version: { type: "string", pattern: VERSION_PATTERN, description: "Patch version, for example 1.0.1.0." },
    },
    required: ["solution"],
    additionalProperties: false,
  },
  route: "/solutions/patch",
  done: "Patch created.",
  describe: (args) => ({ summary: `create a patch of ${str(args.solution)}` }),
  summarize: (args) => `solutions_create_patch ${str(args.solution)}`,
});

export const solutionsAddComponent = write("change", {
  name: "solutions_add_component",
  title: "Add component to solution",
  description: "Adds an existing component to an unmanaged solution. Give componentId, or table (and column) to find it by name. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      solution: solutionProp,
      componentType: componentTypeProp,
      componentId: componentIdProp,
      table: tableProp,
      column: columnProp,
      addRequiredComponents: { type: "boolean", description: "Also add the components this one needs. Default false." },
    },
    required: ["solution", "componentType"],
    additionalProperties: false,
  },
  route: "/solutions/components/add",
  done: "Component added.",
  describe: (args) => ({ summary: `add a ${str(args.componentType)} component to solution ${str(args.solution)}` }),
  summarize: (args) => `solutions_add_component ${str(args.solution)}`,
});

export const solutionsRemoveComponent = write("destructive", {
  name: "solutions_remove_component",
  title: "Remove component from solution",
  description: "Destructive: removes a component from an unmanaged solution. Other solutions keep it. Always asks the user.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      solution: solutionProp,
      componentType: componentTypeProp,
      componentId: componentIdProp,
      table: tableProp,
      column: columnProp,
    },
    required: ["solution", "componentType"],
    additionalProperties: false,
  },
  route: "/solutions/components/remove",
  done: "Component removed.",
  describe: (args) => ({
    summary: `remove a ${str(args.componentType)} component from solution ${str(args.solution)}`,
    removes: `the ${str(args.componentType)} component ${str(args.componentId ?? [args.table, args.column].filter(Boolean).join("."))} from solution ${str(args.solution)}`,
  }),
  summarize: (args) => `solutions_remove_component ${str(args.solution)}`,
});

export const solutionsClone = write("destructive", {
  name: "solutions_clone",
  reportsProgress: true,
  title: "Clone solution",
  description: "Destructive: clones a solution as a new version and rolls up its patches, which removes them. Always asks the user.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      solution: solutionProp,
      version: { type: "string", pattern: VERSION_PATTERN, description: "The new version, for example 2.0.0.0." },
      displayName: { type: "string", description: "Display name. Default the current one." },
    },
    required: ["solution", "version"],
    additionalProperties: false,
  },
  route: "/solutions/clone",
  done: "Solution cloned.",
  describe: (args) => ({
    summary: `clone solution ${str(args.solution)} as version ${str(args.version)}`,
    removes: `the patches of ${str(args.solution)}; they are rolled up into the new version`,
  }),
  summarize: (args) => `solutions_clone ${str(args.solution)}`,
});

export const solutionsRemoveActiveLayer = write("destructive", {
  name: "solutions_remove_active_layer",
  title: "Remove active layer",
  description: "Destructive: removes the Active (unmanaged) layer of a component, discarding its unmanaged changes. Always asks the user.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      componentType: { type: "integer", minimum: 1, description: "Component type number." },
      componentId: componentIdProp,
    },
    required: ["componentType", "componentId"],
    additionalProperties: false,
  },
  route: "/solutions/layers/remove-active",
  done: "Active layer removed.",
  describe: (args) => ({
    summary: "remove the active layer of a component",
    removes: `the unmanaged changes (Active layer) of component ${str(args.componentId)}`,
  }),
  summarize: () => "solutions_remove_active_layer",
});

export const SOLUTION_TOOLS: AgentTool[] = [
  solutionsList,
  solutionsListComponents,
  solutionsListPublishers,
  solutionsListLayers,
  solutionsCreate,
  solutionsCreatePatch,
  solutionsAddComponent,
  solutionsRemoveComponent,
  solutionsClone,
  solutionsRemoveActiveLayer,
];
