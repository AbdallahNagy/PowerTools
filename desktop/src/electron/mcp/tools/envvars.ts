import { dataverseResult } from "../results.js";
import type { AgentTool } from "../types.js";
import { AGENT_API, connectionProp, postAgent, publisherProp, solutionProp } from "./schema.js";

const str = (value: unknown) => String(value);

const schemaNameProp = (what: string) => ({
  type: "string",
  minLength: 1,
  maxLength: 100,
  description: `Schema name of the ${what}, with the publisher's prefix, for example new_ApiUrl.`,
});

export const envvarsList: AgentTool = {
  name: "envvars_list",
  group: "envvars",
  title: "List environment variables",
  description:
    "Lists environment variables with type, default value, current value and whether a current value is set. Secret values are never shown. Read-only.",
  inputSchema: { type: "object", properties: { connection: connectionProp }, additionalProperties: false },
  effect: "read",
  summarize: () => "envvars_list",
  async run(args, ctx) {
    const conn = await ctx.resolveConnection(args.connection as string | undefined);
    const data = await ctx.callSidecar(conn, "GET", `${AGENT_API}/envvars`);
    return dataverseResult("Environment variables.", { variables: data }, conn.displayName);
  },
};

function write(
  effect: "change" | "destructive",
  tool: Pick<AgentTool, "name" | "title" | "description" | "inputSchema" | "describe" | "summarize"> & { route: string; done: string },
): AgentTool {
  return {
    name: tool.name,
    group: "envvars",
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    effect,
    describe: tool.describe,
    summarize: tool.summarize,
    async run(args, ctx) {
      const { conn, data } = await postAgent(args, ctx, tool.route);
      return dataverseResult(tool.done, { result: data }, conn.displayName);
    },
  };
}

export const envvarsCreateDefinition = write("change", {
  name: "envvars_create_definition",
  title: "Create environment variable",
  description:
    "Creates an environment variable definition with an optional default value. Give solution or publisher so the prefix is known. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      schemaName: schemaNameProp("variable"),
      displayName: { type: "string", minLength: 1, maxLength: 100, description: "Display name." },
      type: { type: "string", enum: ["string", "number", "boolean", "json", "secret"], description: "Variable type. Boolean values are yes or no." },
      defaultValue: { type: "string", maxLength: 2000, description: "Default value, valid for the type." },
      description: { type: "string", maxLength: 2000, description: "Description." },
      solution: solutionProp,
      publisher: publisherProp,
    },
    required: ["schemaName", "displayName", "type"],
    additionalProperties: false,
  },
  route: "/envvars/definitions",
  done: "Environment variable created.",
  describe: (args) => ({ summary: `create the environment variable ${str(args.schemaName)}` }),
  summarize: (args) => `envvars_create_definition ${str(args.schemaName)}`,
});

export const envvarsSetValue = write("change", {
  name: "envvars_set_value",
  title: "Set environment variable value",
  description:
    "Sets the current value of an environment variable, creating or updating it. The value must suit the variable's type. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      definition: schemaNameProp("variable to set"),
      value: { type: "string", maxLength: 2000, description: "The new current value." },
    },
    required: ["definition", "value"],
    additionalProperties: false,
  },
  route: "/envvars/values",
  done: "Value saved.",
  describe: (args) => ({ summary: `set the value of the environment variable ${str(args.definition)}` }),
  // The value itself stays out of the activity log: it may be a secret reference or a connection string.
  summarize: (args) => `envvars_set_value ${str(args.definition)}`,
});

export const envvarsDelete = write("destructive", {
  name: "envvars_delete",
  title: "Delete environment variable",
  description:
    "Destructive: deletes an environment variable (kind definition) or only its current value (kind value). Variables that flows or apps use are refused. Always asks the user.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      kind: { type: "string", enum: ["definition", "value"], description: "definition deletes the variable; value deletes only its current value." },
      schemaName: schemaNameProp("variable"),
    },
    required: ["kind", "schemaName"],
    additionalProperties: false,
  },
  route: "/envvars/delete",
  done: "Deleted.",
  describe: (args) => ({
    summary: args.kind === "value" ? `delete the current value of ${str(args.schemaName)}` : `delete the environment variable ${str(args.schemaName)}`,
    removes:
      args.kind === "value"
        ? `the current value of environment variable ${str(args.schemaName)}`
        : `the environment variable ${str(args.schemaName)} and its values`,
  }),
  summarize: (args) => `envvars_delete ${str(args.kind)} ${str(args.schemaName)}`,
});

export const ENVVAR_TOOLS: AgentTool[] = [envvarsList, envvarsCreateDefinition, envvarsSetValue, envvarsDelete];
