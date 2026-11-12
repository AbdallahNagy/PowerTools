import { dataverseResult } from "../results.js";
import type { AgentTool, AgentToolContext } from "../types.js";

export const AGENT_API = "/api/agent";
const NAME_PATTERN = "^[a-z_][a-z0-9_]*$";

export const connectionProp = {
  type: "string",
  description: "Display name of a saved connection (see connections_list). Defaults to the active connection.",
};
export const tableProp = { type: "string", pattern: NAME_PATTERN, description: "Table logical name, for example account." };
export const solutionProp = {
  type: "string",
  description: "Unique name of an unmanaged solution to put the component in. Its publisher decides the prefix.",
};
export const publisherProp = {
  type: "string",
  description: "Publisher unique name or customization prefix. Needed when no solution is given; list them with schema errors or ask the user.",
};
const schemaNameProp = (what: string) => ({
  type: "string",
  minLength: 1,
  description: `Schema name of the ${what}. It must start with the publisher's prefix and an underscore, for example new_rating.`,
});
const displayNameProp = (what: string) => ({ type: "string", minLength: 1, description: `Display name of the ${what}.` });
const requiredLevelProp = {
  type: "string",
  enum: ["none", "recommended", "required"],
  description: "Whether the column is required. Default none.",
};
const optionsProp = (min: number) => ({
  type: "array",
  minItems: min,
  maxItems: 400,
  description: "Choice options in order. A value left out is numbered from the publisher's option value prefix.",
  items: {
    type: "object",
    properties: {
      label: { type: "string", minLength: 1, description: "Option label." },
      value: { type: "integer", description: "Option value. Leave out to number it automatically." },
    },
    required: ["label"],
    additionalProperties: false,
  },
});

/** The body for a sidecar route: every argument except the connection, which only picks the environment. */
export function bodyOf(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([key]) => key !== "connection"));
}

export async function postAgent(args: Record<string, unknown>, ctx: AgentToolContext, route: string, body = bodyOf(args)) {
  // Approval already resolved this connection; the context hands back the same one.
  const conn = await ctx.resolveConnection(args.connection as string | undefined);
  const data = await ctx.callSidecar(conn, "POST", `${AGENT_API}${route}`, body);
  return { conn, data };
}

function change(
  tool: Pick<AgentTool, "name" | "title" | "description" | "inputSchema" | "describe" | "summarize"> & { route: string; done: string },
): AgentTool {
  return {
    name: tool.name,
    group: "schema",
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    effect: "change",
    describe: tool.describe,
    summarize: tool.summarize,
    async run(args, ctx) {
      const { conn, data } = await postAgent(args, ctx, tool.route);
      return dataverseResult(tool.done, { result: data }, conn.displayName);
    },
  };
}

const str = (value: unknown) => String(value);

export const schemaCreateTable = change({
  name: "schema_create_table",
  title: "Create table",
  description:
    "Creates a Dataverse table with a primary name column. Give solution or publisher so the prefix is known; schema names must start with it. Call schema_publish afterwards. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      schemaName: schemaNameProp("table"),
      displayName: displayNameProp("table"),
      pluralName: displayNameProp("table, plural"),
      description: { type: "string", description: "Description of the table." },
      ownership: { type: "string", enum: ["user", "organization"], description: "Who owns the rows: user or organization." },
      primaryNameSchemaName: { type: "string", description: "Schema name of the primary name column. Default <prefix>_name." },
      primaryNameDisplayName: { type: "string", description: "Display name of the primary name column. Default Name." },
      primaryNameMaxLength: { type: "integer", minimum: 1, maximum: 4000, description: "Max length of the primary name. Default 100." },
      solution: solutionProp,
      publisher: publisherProp,
    },
    required: ["schemaName", "displayName", "pluralName", "ownership"],
    additionalProperties: false,
  },
  route: "/schema/tables",
  done: "Table created.",
  describe: (args) => ({ summary: `create table ${str(args.schemaName)}` }),
  summarize: (args) => `schema_create_table ${str(args.schemaName)}`,
});

export const schemaCreateColumn = change({
  name: "schema_create_column",
  title: "Create column",
  description:
    "Creates a column on a table. Types: text, memo, integer, decimal, money, boolean, datetime, dateonly, choice, multichoice, file, image. A choice needs either globalChoice or options. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      table: tableProp,
      schemaName: schemaNameProp("column"),
      displayName: displayNameProp("column"),
      description: { type: "string", description: "Description of the column." },
      type: {
        type: "string",
        enum: ["text", "memo", "integer", "decimal", "money", "boolean", "datetime", "dateonly", "choice", "multichoice", "file", "image"],
        description: "The column type.",
      },
      requiredLevel: requiredLevelProp,
      maxLength: { type: "integer", minimum: 1, description: "Max length for text (up to 4000) or memo (up to 1048576)." },
      minValue: { type: "number", description: "Smallest value for integer, decimal or money." },
      maxValue: { type: "number", description: "Largest value for integer, decimal or money." },
      precision: { type: "integer", minimum: 0, maximum: 10, description: "Decimal places for decimal (0-10) or money (0-4). Default 2." },
      format: { type: "string", enum: ["text", "email", "url", "phone"], description: "Text format. Default text." },
      globalChoice: { type: "string", description: "Name of an existing global choice, for choice and multichoice columns." },
      options: optionsProp(1),
      trueLabel: { type: "string", description: "Label for true, for boolean columns. Default Yes." },
      falseLabel: { type: "string", description: "Label for false, for boolean columns. Default No." },
      solution: solutionProp,
      publisher: publisherProp,
    },
    required: ["table", "schemaName", "displayName", "type"],
    additionalProperties: false,
  },
  route: "/schema/columns",
  done: "Column created.",
  describe: (args) => ({ summary: `create column ${str(args.schemaName)} on ${str(args.table)}` }),
  summarize: (args) => `schema_create_column ${str(args.table)}.${str(args.schemaName)}`,
});

export const schemaCreateLookup = change({
  name: "schema_create_lookup",
  title: "Create lookup",
  description:
    "Creates a lookup column and its relationship. One target is a normal lookup; several targets (up to 10) make a polymorphic lookup, which needs a solution. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      table: tableProp,
      schemaName: schemaNameProp("lookup column"),
      displayName: displayNameProp("lookup column"),
      targets: {
        type: "array",
        minItems: 1,
        maxItems: 10,
        items: { type: "string", pattern: NAME_PATTERN },
        description: "Logical names of the tables the lookup points to.",
      },
      requiredLevel: requiredLevelProp,
      relationshipSchemaName: { type: "string", description: "Relationship schema name. Default <prefix>_<target>_<table>_<lookup>." },
      solution: solutionProp,
      publisher: publisherProp,
    },
    required: ["table", "schemaName", "displayName", "targets"],
    additionalProperties: false,
  },
  route: "/schema/lookups",
  done: "Lookup created.",
  describe: (args) => ({ summary: `create lookup ${str(args.schemaName)} on ${str(args.table)}` }),
  summarize: (args) => `schema_create_lookup ${str(args.table)}.${str(args.schemaName)}`,
});

export const schemaCreateManyToMany = change({
  name: "schema_create_many_to_many",
  title: "Create many-to-many relationship",
  description: "Creates a many-to-many relationship between two tables, with its intersect table. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      table1: { ...tableProp, description: "Logical name of the first table." },
      table2: { ...tableProp, description: "Logical name of the second table." },
      schemaName: schemaNameProp("relationship"),
      solution: solutionProp,
      publisher: publisherProp,
    },
    required: ["table1", "table2", "schemaName"],
    additionalProperties: false,
  },
  route: "/schema/many-to-many",
  done: "Relationship created.",
  describe: (args) => ({ summary: `create many-to-many relationship ${str(args.schemaName)}` }),
  summarize: (args) => `schema_create_many_to_many ${str(args.schemaName)}`,
});

export const schemaCreateChoice = change({
  name: "schema_create_choice",
  title: "Create global choice",
  description: "Creates a global choice (option set) that columns on several tables can share. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      schemaName: schemaNameProp("choice"),
      displayName: displayNameProp("choice"),
      options: optionsProp(1),
      solution: solutionProp,
      publisher: publisherProp,
    },
    required: ["schemaName", "displayName", "options"],
    additionalProperties: false,
  },
  route: "/schema/choices",
  done: "Choice created.",
  describe: (args) => ({ summary: `create choice ${str(args.schemaName)}` }),
  summarize: (args) => `schema_create_choice ${str(args.schemaName)}`,
});

export const schemaAddChoiceOption = change({
  name: "schema_add_choice_option",
  title: "Add choice option",
  description: "Adds one option to a global choice (give choice) or to a column's local choice (give table and column). Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      choice: { type: "string", description: "Name of a global choice." },
      table: tableProp,
      column: { type: "string", pattern: NAME_PATTERN, description: "Column logical name, with table, for a local choice." },
      label: { type: "string", minLength: 1, description: "Option label." },
      value: { type: "integer", description: "Option value. Leave out to let Dataverse pick." },
      solution: solutionProp,
    },
    required: ["label"],
    additionalProperties: false,
  },
  route: "/schema/choices/options",
  done: "Option added.",
  describe: (args) => ({
    summary: `add the option "${str(args.label)}" to ${args.choice ? str(args.choice) : `${str(args.table)}.${str(args.column)}`}`,
  }),
  summarize: (args) => `schema_add_choice_option ${args.choice ? str(args.choice) : `${str(args.table)}.${str(args.column)}`}`,
});

export const SCHEMA_TOOLS: AgentTool[] = [
  schemaCreateTable,
  schemaCreateColumn,
  schemaCreateLookup,
  schemaCreateManyToMany,
  schemaCreateChoice,
  schemaAddChoiceOption,
];
