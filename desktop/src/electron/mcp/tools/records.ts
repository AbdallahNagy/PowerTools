import { messageEffect } from "../../communityTools/messageEffects.js";
import deleteSpec from "../schemas/records_delete.input.json" with { type: "json" };
import writeSpec from "../schemas/records_write.input.json" with { type: "json" };
import { dataverseResult } from "../results.js";
import { AgentToolError, type AgentTool } from "../types.js";
import { applyTool } from "./applyTool.js";
import { connectionProp, DATA_API, steps, str } from "./common.js";

const TYPED_VALUES =
  'Plain strings, numbers, booleans and null are plain. Other types are objects with a "$type": ' +
  '{"$type":"EntityReference","logicalName":"account","id":"<guid>"}, {"$type":"OptionSetValue","value":1}, ' +
  '{"$type":"Money","value":9.5}, {"$type":"DateTime","value":"2026-01-31T10:00:00Z"}, also Decimal, Double, Guid.';

const tablesOf = (items: unknown) => [...new Set((Array.isArray(items) ? items : []).map((i) => str((i as { table?: unknown }).table)))].join(", ");

/** records_write: up to 100 creates, updates, upserts and associates. */
export const recordsWrite: AgentTool = applyTool({
  name: "records_write",
  family: "records_write",
  group: "records",
  title: "Write records",
  description:
    "Changes the environment. Creates, updates, upserts (by id or alternate key) and associates up to 100 records, in order; stops at the first failure, or with allOrNothing runs them in one transaction. The result gives the ids of created records. Values use $type objects for lookups, choices, money and dates. Not for schema: use table_apply.",
  spec: writeSpec,
  describe: (args, plan) => `write records of ${tablesOf(args.operations)} (${steps(plan.steps.length)})`,
  summarize: (args) => `records_write ${tablesOf(args.operations)}`,
});

/** records_delete: always destructive, in its own Settings group so allowing record writes never allows deletes. */
export const recordsDelete: AgentTool = applyTool({
  name: "records_delete",
  family: "records_delete",
  group: "records-delete",
  title: "Delete records",
  description:
    "Destructive: deletes records by id or alternate key, or what a FetchXML query matches up to a required maxCount (1 to 1000), and removes many-to-many links (disassociate). Always asks; the dialog lists each record by its primary name. A record already gone is skipped. Never deletes components: use remove.",
  spec: deleteSpec,
  describe: (_args, plan) => {
    const deletes = plan.steps.filter((s) => s.op === "delete").length;
    const links = plan.steps.filter((s) => s.op === "disassociate").length;
    return [deletes ? `delete ${deletes} record${deletes === 1 ? "" : "s"}` : "", links ? `remove ${links} link${links === 1 ? "" : "s"}` : ""]
      .filter(Boolean)
      .join(" and ") || "delete records";
  },
  summarize: (args) => `records_delete ${tablesOf(args.records) || (args.query ? "query" : "links")}`,
});

/** execute_message: any Dataverse message by name. The effect comes from the message. */
export const executeMessage: AgentTool = {
  name: "execute_message",
  group: "records",
  title: "Run a Dataverse message",
  description:
    "Changes the environment. Runs a Dataverse message (SDK request or Custom API) by name, for what no other tool covers. Dyno decides the effect from the message: known reads run, known writes ask, unknown messages ask as destructive. Wrappers like ExecuteMultiple are refused.",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string", minLength: 1, maxLength: 128, description: "The message name, for example WhoAmI." },
      parameters: { type: "object", description: `Request parameters by name. ${TYPED_VALUES}` },
      connection: connectionProp,
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
    const conn = await ctx.resolveConnection(args.connection as string | undefined);
    const data = await ctx.callSidecar(conn, "POST", `${DATA_API}/execute`, { message: args.message, parameters: args.parameters ?? {} }, ctx.signal);
    return dataverseResult(`Ran ${String(args.message)}.`, { result: data }, conn.displayName);
  },
};
