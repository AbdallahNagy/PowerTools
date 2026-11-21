import tableSpec from "../schemas/table_apply.input.json" with { type: "json" };
import { dataverseResult } from "../results.js";
import type { AgentTool } from "../types.js";
import { applyTool } from "./applyTool.js";
import { AGENT_API, bodyOf, connectionProp } from "./schema.js";

const str = (value: unknown) => String(value);
const tableOf = (args: Record<string, unknown>) => str((args.table as { schemaName?: unknown } | undefined)?.schemaName ?? "").toLowerCase();

/** table_apply: one table and everything on it, from a spec. The plan decides the effect. */
export const tableApply: AgentTool = applyTool({
  name: "table_apply",
  family: "table",
  group: "schema",
  title: "Apply a table",
  description:
    "Changes the environment. Creates or updates one table from a spec: columns of every type, local choice options, lookups, many-to-many relationships and alternate keys, in a solution. Idempotent: only what differs runs; nothing left out is removed. Read a table's spec with inspect_schema kind table. On partlyApplied fix the cause and send the same spec again.",
  spec: tableSpec,
  describe: (args, plan) => `apply table ${tableOf(args)} (${plan.steps.length} step${plan.steps.length === 1 ? "" : "s"})`,
  summarize: (args) => `table_apply ${tableOf(args)}`,
});

const KINDS = ["table", "column", "relationship", "key", "choice", "role"];

/** inspect_schema: reads tables, columns, relationships, keys, global choices and roles. Tables come back as specs. */
export const inspectSchema: AgentTool = {
  name: "inspect_schema",
  group: "metadata",
  title: "Inspect the schema",
  description:
    "Read-only. Describes one table, column, relationship, key, global choice or role by name, or lists them with a filter. A table or column comes back in the shape table_apply takes, so you can change it and apply it. column, relationship and key need table.",
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: KINDS },
      name: { type: "string", minLength: 1, description: "Describe the one with this name (logical name; schema name for relationships and keys). Without it, list." },
      table: { type: "string", pattern: "^[a-z_][a-z0-9_]*$", description: "Table logical name, for column, relationship and key." },
      filter: { type: "string", description: "When listing: only names or display names that contain this text." },
      top: { type: "integer", minimum: 1, maximum: 500, description: "When listing: at most this many. Default 100." },
      connection: connectionProp,
    },
    required: ["kind"],
    additionalProperties: false,
  },
  effect: "read",
  summarize: (args) => `inspect_schema ${str(args.kind)}${args.name ? ` ${str(args.name)}` : ""}`,
  async run(args, ctx) {
    const conn = await ctx.resolveConnection(args.connection as string | undefined);
    const data = await ctx.callSidecar(conn, "POST", `${AGENT_API}/inspect/schema`, bodyOf(args), ctx.signal);
    const what = args.name ? `${str(args.kind)} ${str(args.name)}` : `${str(args.kind)} list`;
    return dataverseResult(`Schema: ${what}.`, { result: data }, conn.displayName);
  },
};
