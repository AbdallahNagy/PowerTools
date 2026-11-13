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

export const schemaUpdateColumn: AgentTool = {
  name: "schema_update_column",
  group: "schema",
  title: "Update column",
  description:
    "Changes a column's display name, description, required level or max length. Lowering maxLength can cut off existing values, so that asks as destructive; anything else is a change. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      table: tableProp,
      column: { type: "string", pattern: NAME_PATTERN, description: "Column logical name." },
      displayName: { type: "string", minLength: 1, description: "New display name." },
      description: { type: "string", description: "New description." },
      requiredLevel: requiredLevelProp,
      maxLength: { type: "integer", minimum: 1, description: "New max length, for text or memo columns." },
      solution: solutionProp,
    },
    required: ["table", "column"],
    additionalProperties: false,
  },
  // Decided here from the column's current length, never from anything the agent says about it.
  effect: async (args, ctx) => {
    if (typeof args.maxLength !== "number") return "change";
    const conn = await ctx.resolveConnection(args.connection as string | undefined);
    const info = (await ctx.callSidecar(
      conn,
      "GET",
      `${AGENT_API}/metadata/tables/${encodeURIComponent(str(args.table))}/columns/${encodeURIComponent(str(args.column))}`,
    )) as { maxLength?: number | null } | null;
    const current = info?.maxLength;
    return typeof current === "number" && args.maxLength < current ? "destructive" : "change";
  },
  describe: (args) => ({
    summary: `update column ${str(args.column)} on ${str(args.table)}`,
    removes: `values longer than ${str(args.maxLength)} characters in ${str(args.table)}.${str(args.column)}`,
  }),
  summarize: (args) => `schema_update_column ${str(args.table)}.${str(args.column)}`,
  async run(args, ctx) {
    const { conn, data } = await postAgent(args, ctx, "/schema/columns/update");
    return dataverseResult("Column updated.", { result: data }, conn.displayName);
  },
};

export const schemaPublish: AgentTool = {
  name: "schema_publish",
  group: "schema",
  reportsProgress: true,
  title: "Publish customizations",
  description:
    "Publishes customizations so schema, form and view changes take effect. Give tables to publish only those; with none it publishes everything. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      tables: {
        type: "array",
        maxItems: 100,
        items: { type: "string", pattern: NAME_PATTERN },
        description: "Logical names of the tables to publish. Leave out to publish all customizations.",
      },
    },
    additionalProperties: false,
  },
  effect: "change",
  describe: (args) => ({
    summary: Array.isArray(args.tables) && args.tables.length > 0 ? `publish ${args.tables.join(", ")}` : "publish all customizations",
  }),
  summarize: (args) => (Array.isArray(args.tables) && args.tables.length > 0 ? "schema_publish (tables)" : "schema_publish (all)"),
  async run(args, ctx) {
    const { conn, data } = await postAgent(args, ctx, "/schema/publish");
    return dataverseResult("Published.", { result: data }, conn.displayName);
  },
};

const GUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const columnToAdd = { type: "string", pattern: NAME_PATTERN, description: "Logical name of the column to add." };

export const schemaAddColumnToForm = change({
  name: "schema_add_column_to_form",
  title: "Add column to form",
  description:
    "Adds a column as a new row at the end of a section of a main or quick create form. Find form ids, tabs and sections with metadata_list_forms. Call schema_publish afterwards. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      table: tableProp,
      formId: { type: "string", pattern: GUID_PATTERN, description: "The form's GUID, from metadata_list_forms." },
      column: columnToAdd,
      tab: { type: "string", description: "Tab name or label. Default the first tab." },
      section: { type: "string", description: "Section name or label. Default the first section of the tab." },
      solution: solutionProp,
    },
    required: ["table", "formId", "column"],
    additionalProperties: false,
  },
  route: "/schema/forms/add-column",
  done: "Column added to the form. Call schema_publish for the table to make it visible.",
  describe: (args) => ({ summary: `add column ${str(args.column)} to a ${str(args.table)} form` }),
  summarize: (args) => `schema_add_column_to_form ${str(args.table)}.${str(args.column)}`,
});

export const schemaAddColumnToView = change({
  name: "schema_add_column_to_view",
  title: "Add column to view",
  description:
    "Adds a column to the end of a system view's grid and to its query. Find view ids with metadata_list_views. Call schema_publish afterwards. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      table: tableProp,
      viewId: { type: "string", pattern: GUID_PATTERN, description: "The view's GUID, from metadata_list_views." },
      column: columnToAdd,
      width: { type: "integer", minimum: 10, maximum: 1000, description: "Column width in pixels. Default 150." },
      solution: solutionProp,
    },
    required: ["table", "viewId", "column"],
    additionalProperties: false,
  },
  route: "/schema/views/add-column",
  done: "Column added to the view. Call schema_publish for the table to make it visible.",
  describe: (args) => ({ summary: `add column ${str(args.column)} to a ${str(args.table)} view` }),
  summarize: (args) => `schema_add_column_to_view ${str(args.table)}.${str(args.column)}`,
});

function destructive(
  tool: Pick<AgentTool, "name" | "title" | "description" | "inputSchema" | "describe" | "summarize"> & { route: string; done: string },
): AgentTool {
  return {
    name: tool.name,
    group: "schema",
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    effect: "destructive",
    describe: tool.describe,
    summarize: tool.summarize,
    async run(args, ctx) {
      const { conn, data } = await postAgent(args, ctx, tool.route);
      return dataverseResult(tool.done, { result: data }, conn.displayName);
    },
  };
}

export const schemaDeleteColumn = destructive({
  name: "schema_delete_column",
  title: "Delete column",
  description: "Destructive: deletes a column and all its data from a table. It cannot be undone. Always asks the user.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      table: tableProp,
      column: { type: "string", pattern: NAME_PATTERN, description: "Logical name of the column to delete." },
    },
    required: ["table", "column"],
    additionalProperties: false,
  },
  route: "/schema/columns/delete",
  done: "Column deleted.",
  describe: (args) => ({
    summary: `delete column ${str(args.column)} from ${str(args.table)}`,
    removes: `column ${str(args.column)} from ${str(args.table)} and all its data`,
  }),
  summarize: (args) => `schema_delete_column ${str(args.table)}.${str(args.column)}`,
});

export const schemaDeleteTable = destructive({
  name: "schema_delete_table",
  title: "Delete table",
  description: "Destructive: deletes a custom table with all its rows and columns. System tables are refused. It cannot be undone. Always asks the user.",
  inputSchema: {
    type: "object",
    properties: { connection: connectionProp, table: tableProp },
    required: ["table"],
    additionalProperties: false,
  },
  route: "/schema/tables/delete",
  done: "Table deleted.",
  describe: (args) => ({
    summary: `delete table ${str(args.table)}`,
    removes: `table ${str(args.table)} with all its rows and columns`,
  }),
  summarize: (args) => `schema_delete_table ${str(args.table)}`,
});

export const schemaDeleteRelationship = destructive({
  name: "schema_delete_relationship",
  title: "Delete relationship",
  description: "Destructive: deletes a relationship by schema name. For a lookup relationship the lookup column goes with it. It cannot be undone. Always asks the user.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      schemaName: { type: "string", minLength: 1, description: "Schema name of the relationship to delete." },
    },
    required: ["schemaName"],
    additionalProperties: false,
  },
  route: "/schema/relationships/delete",
  done: "Relationship deleted.",
  describe: (args) => ({
    summary: `delete relationship ${str(args.schemaName)}`,
    removes: `relationship ${str(args.schemaName)}`,
  }),
  summarize: (args) => `schema_delete_relationship ${str(args.schemaName)}`,
});

export const schemaDeleteChoice = destructive({
  name: "schema_delete_choice",
  title: "Delete global choice",
  description:
    "Destructive: deletes a custom global choice (option set). Dataverse refuses one that columns still use; system and managed choices are refused. It cannot be undone. Always asks the user.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      choice: { type: "string", minLength: 1, description: "Name of the global choice to delete." },
    },
    required: ["choice"],
    additionalProperties: false,
  },
  route: "/schema/choices/delete",
  done: "Choice deleted.",
  describe: (args) => ({
    summary: `delete global choice ${str(args.choice)}`,
    removes: `global choice ${str(args.choice)} and its options`,
  }),
  summarize: (args) => `schema_delete_choice ${str(args.choice)}`,
});

export const schemaRemoveColumnFromForm = destructive({
  name: "schema_remove_column_from_form",
  title: "Remove column from form",
  description:
    "Destructive: takes a column off a main or quick create form, wherever it appears there (tabs, header, footer). The column and its data stay. Find form ids with metadata_list_forms; call schema_publish afterwards. Always asks the user.",
  inputSchema: {
    type: "object",
    properties: {
      connection: connectionProp,
      table: tableProp,
      formId: { type: "string", pattern: GUID_PATTERN, description: "The form's GUID, from metadata_list_forms." },
      column: { type: "string", pattern: NAME_PATTERN, description: "Logical name of the column to take off the form." },
      solution: solutionProp,
    },
    required: ["table", "formId", "column"],
    additionalProperties: false,
  },
  route: "/schema/forms/remove-column",
  done: "Column removed from the form. Call schema_publish for the table to make it visible.",
  describe: (args) => ({
    summary: `remove column ${str(args.column)} from a form of ${str(args.table)}`,
    removes: `column ${str(args.column)} from form ${str(args.formId)} (the column and its data stay)`,
  }),
  summarize: (args) => `schema_remove_column_from_form ${str(args.table)}.${str(args.column)}`,
});

export const SCHEMA_TOOLS: AgentTool[] = [
  schemaCreateTable,
  schemaCreateColumn,
  schemaCreateLookup,
  schemaCreateManyToMany,
  schemaCreateChoice,
  schemaAddChoiceOption,
  schemaUpdateColumn,
  schemaPublish,
  schemaAddColumnToForm,
  schemaAddColumnToView,
  schemaRemoveColumnFromForm,
  schemaDeleteColumn,
  schemaDeleteTable,
  schemaDeleteRelationship,
  schemaDeleteChoice,
];
