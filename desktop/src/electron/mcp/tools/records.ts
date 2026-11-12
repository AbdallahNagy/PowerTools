import { clampPageSize, dataverseResult } from "../results.js";
import type { AgentTool } from "../types.js";

const connection = {
  type: "string",
  description: "Display name of a saved connection (see connections_list). Defaults to the active connection.",
};

const API = "/api/community-tools/data";

export const recordsQuery: AgentTool = {
  name: "records_query",
  group: "records",
  title: "Query records",
  description:
    "Runs a FetchXML query and returns one page of records. Use metadata_list_columns first for exact logical names. pageSize defaults to 50, max 500; pass pagingCookie and page+1 for the next page. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      connection,
      fetchXml: { type: "string", minLength: 1, description: "The FetchXML query text." },
      page: { type: "integer", minimum: 1, description: "Page number, starting at 1. Default 1." },
      pageSize: { type: "integer", description: "Rows per page, 1 to 500. Default 50." },
      pagingCookie: { type: "string", description: "The pagingCookie from the previous page, when asking for the next." },
    },
    required: ["fetchXml"],
    additionalProperties: false,
  },
  effect: "read",
  async run(args, ctx) {
    const conn = await ctx.resolveConnection(args.connection as string | undefined);
    const body = {
      fetchXml: args.fetchXml,
      page: typeof args.page === "number" ? args.page : 1,
      pageSize: clampPageSize(args.pageSize),
      pagingCookie: args.pagingCookie,
    };
    const result = (await ctx.callSidecar(conn, "POST", `${API}/fetch`, body)) as Record<string, unknown> | null;
    const page = result ?? {};
    const count = Array.isArray(page.records) ? page.records.length : 0;
    return dataverseResult(`Returned ${count} record(s).`, page, conn.displayName);
  },
};

export const recordsGet: AgentTool = {
  name: "records_get",
  group: "records",
  title: "Get record",
  description:
    "Gets one Dataverse record by table and id, returning the listed columns. List the columns you need; use metadata_list_columns for exact logical names. Read-only.",
  inputSchema: {
    type: "object",
    properties: {
      connection,
      table: { type: "string", pattern: "^[a-z_][a-z0-9_]*$", description: "Table logical name, for example account." },
      id: {
        type: "string",
        pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        description: "The record's GUID.",
      },
      columns: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: { type: "string" },
        description: "Column logical names to return (1 to 100).",
      },
    },
    required: ["table", "id", "columns"],
    additionalProperties: false,
  },
  effect: "read",
  summarize: (args) => `records_get ${String(args.table)}`,
  async run(args, ctx) {
    const conn = await ctx.resolveConnection(args.connection as string | undefined);
    const record = await ctx.callSidecar(conn, "POST", `${API}/retrieve`, {
      table: args.table,
      id: args.id,
      columns: args.columns,
    });
    return dataverseResult(`Record of ${String(args.table)}.`, { record }, conn.displayName);
  },
};
