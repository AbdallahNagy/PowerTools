import { messageEffect } from "../../communityTools/messageEffects.js";
import { dataverseResult } from "../results.js";
import { AgentToolError, type AgentTool } from "../types.js";

const API = "/api/community-tools/data";
const NAME_PATTERN = "^[a-z_][a-z0-9_]*$";
const GUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

const connection = {
  type: "string",
  description: "Display name of a saved connection (see connections_list). Defaults to the active connection.",
};
const table = { type: "string", pattern: NAME_PATTERN, description: "Table logical name, for example account." };
const id = { type: "string", pattern: GUID_PATTERN, description: "The record's GUID." };

const TYPED_VALUES =
  'Plain strings, numbers, booleans and null are plain. Other types are objects with a "$type": ' +
  '{"$type":"EntityReference","logicalName":"account","id":"<guid>"}, {"$type":"OptionSetValue","value":1}, ' +
  '{"$type":"Money","value":9.5}, {"$type":"DateTime","value":"2026-01-31T10:00:00Z"}, also Decimal, Double, Guid.';

const related = {
  type: "array",
  minItems: 1,
  maxItems: 100,
  description: "The records to relate, each with its table logicalName and id.",
  items: {
    type: "object",
    properties: {
      logicalName: { type: "string", pattern: NAME_PATTERN, description: "Table logical name of the related record." },
      id,
    },
    required: ["logicalName", "id"],
    additionalProperties: false,
  },
};
const relationship = { type: "string", minLength: 1, description: "Schema name of the relationship." };

async function send(
  args: Record<string, unknown>,
  ctx: Parameters<AgentTool["run"]>[1],
  route: string,
  body: Record<string, unknown>,
) {
  // Approval already resolved this connection; the context hands back the same one.
  const conn = await ctx.resolveConnection(args.connection as string | undefined);
  const data = await ctx.callSidecar(conn, "POST", `${API}/${route}`, body);
  return { conn, data };
}

export const recordsCreate: AgentTool = {
  name: "records_create",
  group: "records",
  title: "Create record",
  description: "Creates a Dataverse record and returns its id. Use metadata_list_columns first for exact column names. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection,
      table,
      values: { type: "object", description: `Column logical names mapped to values. ${TYPED_VALUES}` },
    },
    required: ["table", "values"],
    additionalProperties: false,
  },
  effect: "change",
  describe: (args) => ({ summary: `create a ${String(args.table)} record` }),
  summarize: (args) => `records_create ${String(args.table)}`,
  async run(args, ctx) {
    const { conn, data } = await send(args, ctx, "create", { table: args.table, values: args.values });
    return dataverseResult(`Created a ${String(args.table)} record.`, { result: data }, conn.displayName);
  },
};

export const recordsUpdate: AgentTool = {
  name: "records_update",
  group: "records",
  title: "Update record",
  description: "Updates columns of one Dataverse record. Only the listed columns change. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection,
      table,
      id,
      values: { type: "object", description: `Column logical names mapped to new values. ${TYPED_VALUES}` },
    },
    required: ["table", "id", "values"],
    additionalProperties: false,
  },
  effect: "change",
  describe: (args) => ({ summary: `update a ${String(args.table)} record` }),
  summarize: (args) => `records_update ${String(args.table)}`,
  async run(args, ctx) {
    const { conn, data } = await send(args, ctx, "update", { table: args.table, id: args.id, values: args.values });
    return dataverseResult(`Updated a ${String(args.table)} record.`, { result: data }, conn.displayName);
  },
};

export const recordsDelete: AgentTool = {
  name: "records_delete",
  group: "records",
  title: "Delete record",
  description: "Destructive: permanently deletes one Dataverse record by table and id. It cannot be undone. Always asks the user.",
  inputSchema: {
    type: "object",
    properties: { connection, table, id },
    required: ["table", "id"],
    additionalProperties: false,
  },
  effect: "destructive",
  describe: (args) => ({
    summary: `delete a ${String(args.table)} record`,
    removes: `record ${String(args.table)} ${String(args.id)}`,
  }),
  summarize: (args) => `records_delete ${String(args.table)}`,
  async run(args, ctx) {
    const { conn, data } = await send(args, ctx, "delete", { table: args.table, id: args.id });
    return dataverseResult(`Deleted a ${String(args.table)} record.`, { result: data }, conn.displayName);
  },
};

export const recordsAssociate: AgentTool = {
  name: "records_associate",
  group: "records",
  title: "Associate records",
  description: "Relates records to a record through a many-to-many or one-to-many relationship. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: { connection, table, id, relationship, related },
    required: ["table", "id", "relationship", "related"],
    additionalProperties: false,
  },
  effect: "change",
  describe: (args) => ({
    summary: `relate ${(args.related as unknown[]).length} record(s) to a ${String(args.table)} record`,
  }),
  summarize: (args) => `records_associate ${String(args.table)}`,
  async run(args, ctx) {
    const { conn, data } = await send(args, ctx, "associate", {
      table: args.table,
      id: args.id,
      relationship: args.relationship,
      related: args.related,
    });
    return dataverseResult("Records related.", { result: data }, conn.displayName);
  },
};

export const recordsDisassociate: AgentTool = {
  name: "records_disassociate",
  group: "records",
  title: "Disassociate records",
  description: "Destructive: removes the relationship between records. The records stay, the link is lost. Always asks the user.",
  inputSchema: {
    type: "object",
    properties: { connection, table, id, relationship, related },
    required: ["table", "id", "relationship", "related"],
    additionalProperties: false,
  },
  effect: "destructive",
  describe: (args) => ({
    summary: `remove links from a ${String(args.table)} record`,
    removes: `${(args.related as unknown[]).length} link(s) on ${String(args.table)} ${String(args.id)} (${String(args.relationship)})`,
  }),
  summarize: (args) => `records_disassociate ${String(args.table)}`,
  async run(args, ctx) {
    const { conn, data } = await send(args, ctx, "disassociate", {
      table: args.table,
      id: args.id,
      relationship: args.relationship,
      related: args.related,
    });
    return dataverseResult("Links removed.", { result: data }, conn.displayName);
  },
};

export const executeMessage: AgentTool = {
  name: "execute_message",
  group: "records",
  title: "Run a Dataverse message",
  description:
    "Runs a Dataverse message (SDK request or custom API) by name. Power Tools decides the effect from the message: known reads run, known writes ask, unknown messages ask as destructive. Wrappers like ExecuteMultiple are refused. Changes the environment.",
  inputSchema: {
    type: "object",
    properties: {
      connection,
      message: { type: "string", minLength: 1, maxLength: 128, description: "The message name, for example WhoAmI." },
      parameters: { type: "object", description: `Request parameters by name. ${TYPED_VALUES}` },
    },
    required: ["message"],
    additionalProperties: false,
  },
  effect: (args) => {
    const effect = messageEffect(String(args.message));
    if (effect === "forbidden") {
      throw new AgentToolError(
        "InvalidRequest",
        `Message "${String(args.message)}" cannot be run`,
        "Wrapper messages such as ExecuteMultiple are not allowed; call the operations one by one.",
      );
    }
    return effect;
  },
  describe: (args) => {
    const effect = messageEffect(String(args.message));
    return {
      summary: `run the ${String(args.message)} message`,
      ...(effect === "destructive" ? { removes: `whatever ${String(args.message)} removes or replaces` } : {}),
    };
  },
  summarize: (args) => `execute_message ${String(args.message)}`,
  async run(args, ctx) {
    const { conn, data } = await send(args, ctx, "execute", { message: args.message, parameters: args.parameters ?? {} });
    return dataverseResult(`Ran ${String(args.message)}.`, { result: data }, conn.displayName);
  },
};

export const WRITE_TOOLS: AgentTool[] = [
  recordsCreate,
  recordsUpdate,
  recordsDelete,
  recordsAssociate,
  recordsDisassociate,
  executeMessage,
];
