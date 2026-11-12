import { dataverseResult } from "../results.js";
import { AgentToolError, type AgentTool, type AgentToolContext } from "../types.js";

const BASE = "/api/community-tools/metadata/tables";
const NAME_PATTERN = "^[a-z_][a-z0-9_]*$";

const connection = {
  type: "string",
  description: "Display name of a saved connection (see connections_list). Defaults to the active connection.",
};
const table = {
  type: "string",
  pattern: NAME_PATTERN,
  description: "Table logical name, for example account.",
};
const search = {
  type: "string",
  description: "Keep only items whose logical or display name contains this text (case-insensitive).",
};
const customOnly = { type: "boolean", description: "Keep only custom items." };

interface Named {
  logicalName?: string;
  displayName?: string;
  isCustom?: boolean;
}

function filterNamed(items: Named[], args: Record<string, unknown>): Named[] {
  const text = typeof args.search === "string" ? args.search.toLowerCase() : "";
  return items.filter(
    (item) =>
      (!args.customOnly || item.isCustom === true) &&
      (!text ||
        (item.logicalName ?? "").toLowerCase().includes(text) ||
        (item.displayName ?? "").toLowerCase().includes(text)),
  );
}

async function get(args: Record<string, unknown>, ctx: AgentToolContext, path: string) {
  const conn = await ctx.resolveConnection(args.connection as string | undefined);
  const data = await ctx.callSidecar(conn, "GET", path);
  return { conn, data };
}

const enc = encodeURIComponent;

export const metadataListTables: AgentTool = {
  name: "metadata_list_tables",
  group: "metadata",
  title: "List tables",
  description:
    "Lists Dataverse tables with logical names, display names and whether they are custom. Filter with search or customOnly; returns at most limit items (default 50, max 500) and the total. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      connection,
      search,
      customOnly,
      limit: { type: "integer", minimum: 1, maximum: 500, description: "Maximum tables to return. Default 50." },
    },
    additionalProperties: false,
  },
  effect: "read",
  summarize: (args) => `metadata_list_tables${typeof args.search === "string" ? " (filtered)" : ""}`,
  async run(args, ctx) {
    const { conn, data } = await get(args, ctx, BASE);
    const filtered = filterNamed(Array.isArray(data) ? (data as Named[]) : [], args);
    const limit = typeof args.limit === "number" ? args.limit : 50;
    const tables = filtered.slice(0, limit);
    return dataverseResult(
      `Returned ${tables.length} of ${filtered.length} tables.`,
      { tables, total: filtered.length, returned: tables.length },
      conn.displayName,
    );
  },
};

export const metadataGetTable: AgentTool = {
  name: "metadata_get_table",
  group: "metadata",
  title: "Get table",
  description:
    "Gets one Dataverse table: logical name, display name, entity set name, primary id and primary name columns, and whether it is custom. Read-only.",
  inputSchema: { type: "object", properties: { connection, table }, required: ["table"], additionalProperties: false },
  effect: "read",
  summarize: (args) => `metadata_get_table ${String(args.table)}`,
  async run(args, ctx) {
    const { conn, data } = await get(args, ctx, `${BASE}/${enc(args.table as string)}`);
    return dataverseResult(`Table ${String(args.table)}.`, { table: data }, conn.displayName);
  },
};

export const metadataListColumns: AgentTool = {
  name: "metadata_list_columns",
  group: "metadata",
  title: "List columns",
  description:
    "Lists the columns (attributes) of a Dataverse table with logical names, display names, types and required level. Use before creating or querying, to get exact logical names. Filter with search. Read-only.",
  inputSchema: {
    type: "object",
    properties: { connection, table, search, customOnly },
    required: ["table"],
    additionalProperties: false,
  },
  effect: "read",
  summarize: (args) => `metadata_list_columns ${String(args.table)}`,
  async run(args, ctx) {
    const { conn, data } = await get(args, ctx, `${BASE}/${enc(args.table as string)}/columns`);
    const columns = filterNamed(Array.isArray(data) ? (data as Named[]) : [], args);
    return dataverseResult(
      `${columns.length} column(s) of ${String(args.table)}.`,
      { columns, total: columns.length, returned: columns.length },
      conn.displayName,
    );
  },
};

export const metadataListRelationships: AgentTool = {
  name: "metadata_list_relationships",
  group: "metadata",
  title: "List relationships",
  description:
    "Lists the relationships of a Dataverse table: schema name, kind, referenced and referencing tables and the referencing column. Read-only.",
  inputSchema: { type: "object", properties: { connection, table }, required: ["table"], additionalProperties: false },
  effect: "read",
  summarize: (args) => `metadata_list_relationships ${String(args.table)}`,
  async run(args, ctx) {
    const { conn, data } = await get(args, ctx, `${BASE}/${enc(args.table as string)}/relationships`);
    return dataverseResult(`Relationships of ${String(args.table)}.`, { relationships: data }, conn.displayName);
  },
};

export const metadataGetChoices: AgentTool = {
  name: "metadata_get_choices",
  group: "metadata",
  title: "Get choices",
  description:
    "Lists the choice (option set) values and labels of a column (give table and column) or of a global choice (give choice). Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      connection,
      table: { ...table, description: "Table logical name, with column. Leave out when giving choice." },
      column: { type: "string", pattern: NAME_PATTERN, description: "Column logical name, with table, for example statuscode." },
      choice: { type: "string", description: "Name of a global choice. Use instead of table and column." },
    },
    additionalProperties: false,
  },
  effect: "read",
  summarize: (args) => `metadata_get_choices ${args.choice ? String(args.choice) : `${String(args.table)}.${String(args.column)}`}`,
  async run(args, ctx) {
    const byName = typeof args.choice === "string";
    const byColumn = typeof args.table === "string" && typeof args.column === "string";
    if (byName === byColumn) {
      throw new AgentToolError("InvalidRequest", "Give either choice, or table and column");
    }
    if (byName) {
      const { conn, data } = await get(args, ctx, `/api/agent/metadata/choices/${enc(args.choice as string)}`);
      return dataverseResult(`Choices of ${String(args.choice)}.`, { choices: data }, conn.displayName);
    }
    const path = `${BASE}/${enc(args.table as string)}/columns/${enc(args.column as string)}/choices`;
    const { conn, data } = await get(args, ctx, path);
    return dataverseResult(`Choices of ${String(args.table)}.${String(args.column)}.`, { choices: data }, conn.displayName);
  },
};
