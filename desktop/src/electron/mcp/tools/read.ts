import { clampPageSize, dataverseResult } from "../results.js";
import { AgentToolError, type AgentTool, type JsonSchemaObject } from "../types.js";
import { connectionProp, DATA_API, GUID_PATTERN, NAME_PATTERN, postAgent, str } from "./common.js";

/** The arguments every inspect tool takes besides its kinds. */
function inspectSchema(kinds: string[], tableFor: string, extra: Record<string, object> = {}): JsonSchemaObject {
  return {
    type: "object",
    properties: {
      kind: { type: "string", enum: kinds },
      name: { type: "string", minLength: 1, description: "Describe the one with this name or id. Without it, list." },
      table: { type: "string", pattern: NAME_PATTERN, description: `Table logical name, for ${tableFor}.` },
      filter: { type: "string", description: "When listing: only names that contain this text." },
      top: { type: "integer", minimum: 1, maximum: 500, description: "When listing: at most this many. Default 100." },
      ...extra,
      connection: connectionProp,
    },
    required: ["kind"],
    additionalProperties: false,
  };
}

function inspectTool(name: string, route: string, title: string, description: string, schema: JsonSchemaObject): AgentTool {
  return {
    name,
    group: "read",
    title,
    description,
    inputSchema: schema,
    effect: "read",
    summarize: (args) => `${name} ${str(args.kind)}${args.name ? ` ${str(args.name)}` : ""}`,
    async run(args, ctx) {
      const { conn, data } = await postAgent(args, ctx, route);
      const what = args.name ? `${str(args.kind)} ${str(args.name)}` : `${str(args.kind)} list`;
      return dataverseResult(`${title}: ${what}.`, { result: data }, conn.displayName);
    },
  };
}

/** inspect_ui: forms, views, apps, site maps, modern commands and web resources. */
export const inspectUi = inspectTool(
  "inspect_ui",
  "/inspect/ui",
  "Inspect the UI",
  "Read-only. Describes one form, view, app, sitemap, command or webresource by name, or lists them. A view comes back in the shape view_apply takes; a form lists its tabs, sections and fields by the names form_apply uses. A text web resource includes its content. form and view need table. command is online only.",
  inspectSchema(["form", "view", "app", "sitemap", "command", "webresource"], "form and view"),
);

const COMPONENT_KINDS = [
  "table", "column", "relationship", "key", "choice", "form", "view", "app", "sitemap", "webresource", "command",
  "process", "flow", "customapi", "pluginassembly", "plugintype", "pluginstep", "pluginimage", "role", "envvar", "connectionreference",
];

/** inspect_solution: solutions, layers, publishers, configuration and logic. */
export const inspectSolution = inspectTool(
  "inspect_solution",
  "/inspect/solution",
  "Inspect solutions",
  "Read-only. Describes or lists: solution (with patches), solutioncomponents (name = solution), layers (of one component: componentKind, name), publisher, envvar (secrets hidden), connectionreference, pluginassembly (with types), pluginstep (in the shape plugin_step_apply takes), customapi, process and bpf (business process flow), each in the shape its apply tool takes, flow.",
  inspectSchema(
    ["solution", "solutioncomponents", "layers", "publisher", "envvar", "connectionreference", "pluginassembly", "pluginstep", "customapi", "process", "bpf", "flow"],
    "the layers of a column, form, view or key",
    { componentKind: { type: "string", enum: COMPONENT_KINDS, description: "layers: the kind of component." } },
  ),
);

const OPERATORS = ["eq", "ne", "gt", "ge", "lt", "le", "like", "not-like", "null", "not-null", "in", "not-in", "on", "on-or-after", "on-or-before", "eq-userid", "eq-businessid"];
const NO_VALUE = new Set(["null", "not-null", "eq-userid", "eq-businessid"]);

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

interface Condition {
  column: string;
  operator: string;
  value?: string | number | boolean;
  values?: Array<string | number>;
}

/** Writes FetchXML for a table, its columns, a filter and a sort. Every name is checked against NAME_PATTERN by the schema. */
export function buildFetchXml(args: { table: string; columns?: string[]; filter?: Condition[]; filterType?: string; orderBy?: string; descending?: boolean }): string {
  const attributes = (args.columns ?? []).map((c) => `<attribute name="${escapeXml(c)}"/>`).join("");
  const conditions = (args.filter ?? [])
    .map((c) => {
      if (NO_VALUE.has(c.operator)) return `<condition attribute="${escapeXml(c.column)}" operator="${c.operator}"/>`;
      if (c.operator === "in" || c.operator === "not-in") {
        if (!c.values?.length) throw new AgentToolError("InvalidRequest", `Operator ${c.operator} on ${c.column} needs values.`);
        const values = c.values.map((v) => `<value>${escapeXml(String(v))}</value>`).join("");
        return `<condition attribute="${escapeXml(c.column)}" operator="${c.operator}">${values}</condition>`;
      }
      if (c.value === undefined) throw new AgentToolError("InvalidRequest", `Operator ${c.operator} on ${c.column} needs value.`);
      return `<condition attribute="${escapeXml(c.column)}" operator="${c.operator}" value="${escapeXml(String(c.value))}"/>`;
    })
    .join("");
  const filter = conditions ? `<filter type="${args.filterType === "or" ? "or" : "and"}">${conditions}</filter>` : "";
  const order = args.orderBy ? `<order attribute="${escapeXml(args.orderBy)}"${args.descending ? ' descending="true"' : ""}/>` : "";
  const all = attributes ? "" : "<all-attributes/>";
  return `<fetch><entity name="${escapeXml(args.table)}">${all}${attributes}${order}${filter}</entity></fetch>`;
}

/** Keeps the columns that were asked for; an asked-for column without a value comes back as null. */
export function onlyColumns(record: unknown, columns: unknown): unknown {
  if (!record || typeof record !== "object" || !Array.isArray(columns)) return record;
  const row = record as { values?: Record<string, unknown>; formatted?: Record<string, unknown> };
  const wanted = columns.map((c) => String(c).toLowerCase());
  const values = Object.fromEntries(wanted.map((c) => [c, row.values?.[c] ?? null]));
  const formatted = Object.fromEntries(Object.entries(row.formatted ?? {}).filter(([key]) => wanted.includes(key.toLowerCase())));
  return { ...row, values, formatted };
}

/** records_query: FetchXML, or a table with columns and a simple filter, or one record by id. */
export const recordsQuery: AgentTool = {
  name: "records_query",
  group: "read",
  title: "Query records",
  description:
    "Read-only. Reads records: give fetchXml, or table with columns, filter and orderBy, or table and id for one record. One page per call: pageSize defaults to 50, at most 500; for the next page pass page+1 and the pagingCookie. Use inspect_schema kind column for exact logical names.",
  inputSchema: {
    type: "object",
    properties: {
      fetchXml: { type: "string", minLength: 1, description: "A FetchXML query. Instead of table." },
      table: { type: "string", pattern: NAME_PATTERN, description: "Table logical name." },
      id: { type: "string", pattern: GUID_PATTERN, description: "One record's id; needs table and columns." },
      columns: { type: "array", minItems: 1, maxItems: 100, items: { type: "string", pattern: NAME_PATTERN }, description: "Columns to return. Default all." },
      filter: {
        type: "array",
        maxItems: 20,
        description: "Conditions on the table's columns.",
        items: {
          type: "object",
          properties: {
            column: { type: "string", pattern: NAME_PATTERN },
            operator: { type: "string", enum: OPERATORS },
            value: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] },
            values: { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] } },
          },
          required: ["column", "operator"],
          additionalProperties: false,
        },
      },
      filterType: { type: "string", enum: ["and", "or"], description: "Default and." },
      orderBy: { type: "string", pattern: NAME_PATTERN },
      descending: { type: "boolean" },
      page: { type: "integer", minimum: 1, description: "Page number, from 1." },
      pageSize: { type: "integer", minimum: 1, maximum: 500 },
      pagingCookie: { type: "string", description: "From the previous page." },
      connection: connectionProp,
    },
    additionalProperties: false,
  },
  effect: "read",
  summarize: (args) => `records_query ${args.table ? str(args.table) : "fetchXml"}`,
  async run(args, ctx) {
    const conn = await ctx.resolveConnection(args.connection as string | undefined);
    if (args.id !== undefined) {
      if (!args.table || !Array.isArray(args.columns)) throw new AgentToolError("InvalidRequest", "A record by id needs table and columns.");
      const record = await ctx.callSidecar(conn, "POST", `${DATA_API}/retrieve`, { table: args.table, id: args.id, columns: args.columns }, ctx.signal);
      return dataverseResult(`Record of ${str(args.table)}.`, { record: onlyColumns(record, args.columns) }, conn.displayName);
    }

    if ((args.fetchXml === undefined) === (args.table === undefined)) throw new AgentToolError("InvalidRequest", "Give fetchXml or table, not both.");
    const fetchXml =
      typeof args.fetchXml === "string"
        ? args.fetchXml
        : buildFetchXml({
            table: str(args.table),
            columns: args.columns as string[] | undefined,
            filter: args.filter as Condition[] | undefined,
            filterType: args.filterType as string | undefined,
            orderBy: args.orderBy as string | undefined,
            descending: args.descending === true,
          });
    const body = { fetchXml, page: typeof args.page === "number" ? args.page : 1, pageSize: clampPageSize(args.pageSize), pagingCookie: args.pagingCookie };
    const page = ((await ctx.callSidecar(conn, "POST", `${DATA_API}/fetch`, body, ctx.signal)) as Record<string, unknown> | null) ?? {};
    const count = Array.isArray(page.records) ? page.records.length : 0;
    return dataverseResult(`Returned ${count} record(s).`, page, conn.displayName);
  },
};
