import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import applyResultSchema from "../schemas/apply-result.json" with { type: "json" };
import { truncateText, UNTRUSTED_PREFIX } from "../results.js";
import {
  AgentToolError,
  type AgentTool,
  type AgentToolGroup,
  type JsonSchemaObject,
  type PlanPreview,
  type PlanStep,
} from "../types.js";

/** The result every apply tool returns. Mirrors schemas/apply-result.json, which is generated from ApplyResult.cs. */
export interface ApplyResult {
  outcome: "applied" | "unchanged" | "partlyApplied" | "failed" | "refused" | "planned";
  steps: Array<{ op: string; target: string; status: string; error?: string | null; dataverseCode?: number | null; ids?: string[] | null }>;
  published: string[];
  remaining: { steps: PlanStep[] };
  warnings: string[];
  code?: string | null;
  message?: string | null;
}

/** The output schema of every apply tool. */
export const APPLY_RESULT_SCHEMA = applyResultSchema as unknown as JsonSchemaObject;

/** Outcomes the agent must notice: something did not happen. */
const ERROR_OUTCOMES = new Set<ApplyResult["outcome"]>(["partlyApplied", "failed", "refused"]);

const OUTCOME_TEXT: Record<ApplyResult["outcome"], string> = {
  applied: "Applied. Every step ran and the environment now matches the spec.",
  unchanged: "Unchanged. The environment already matches the spec.",
  planned: "Dry run. Nothing was changed; these are the steps an apply would run.",
  partlyApplied:
    "Partly applied. Some steps ran; the rest are in remaining. Fix the cause and send the same spec again: only what is left runs.",
  failed: "Failed. Nothing was changed. Fix the cause and send the spec again.",
  refused: "Refused. Nothing was changed, because the environment changed since the plan or another change held it. Run the call again.",
};

/** Turns an apply result into the tool result. Dataverse error text inside it is marked as untrusted. */
export function applyToolResult(result: ApplyResult): CallToolResult {
  const why = result.message ? ` ${result.code ? `[${result.code}] ` : ""}${result.message}` : "";
  const text = `${UNTRUSTED_PREFIX}\n${OUTCOME_TEXT[result.outcome]}${why}\n${JSON.stringify(result)}`;
  return {
    ...(ERROR_OUTCOMES.has(result.outcome) ? { isError: true } : {}),
    content: [{ type: "text", text: truncateText(text) }],
    structuredContent: result as unknown as Record<string, unknown>,
    _meta: { "powertools/untrusted": true },
  };
}

/** The result of a dry run: nothing ran; remaining holds the plan. */
export function plannedResult(plan: PlanPreview): CallToolResult {
  return applyToolResult({
    outcome: "planned",
    steps: [],
    published: [],
    remaining: { steps: plan.steps },
    warnings: plan.warnings,
  });
}

/** The result of an empty plan. The server returns it without asking the user or calling apply. */
export function unchangedResult(plan: PlanPreview): CallToolResult {
  return applyToolResult({ outcome: "unchanged", steps: [], published: [], remaining: { steps: [] }, warnings: plan.warnings });
}

const EFFECTS = new Set(["read", "change", "destructive"]);

function isPlanPreview(value: unknown): value is PlanPreview {
  const plan = value as PlanPreview | null;
  return (
    typeof plan === "object" &&
    plan !== null &&
    EFFECTS.has(plan.effect) &&
    typeof plan.hash === "string" &&
    plan.hash.length > 0 &&
    Array.isArray(plan.steps) &&
    plan.steps.every((s) => typeof s?.op === "string" && typeof s?.target === "string" && EFFECTS.has(s?.effect)) &&
    Array.isArray(plan.warnings)
  );
}

function isApplyResult(value: unknown): value is ApplyResult {
  const result = value as ApplyResult | null;
  return (
    typeof result === "object" &&
    result !== null &&
    typeof result.outcome === "string" &&
    result.outcome in OUTCOME_TEXT &&
    Array.isArray(result.steps) &&
    Array.isArray(result.published) &&
    Array.isArray(result.remaining?.steps) &&
    Array.isArray(result.warnings)
  );
}

/** Arguments every apply tool has besides its spec. They are never sent to the sidecar as part of the spec. */
const COMMON_PROPERTIES = {
  connection: { type: "string", description: "Saved connection name. Default: the active connection." },
  dryRun: { type: "boolean", description: "Return the plan without changing anything. Needs no approval." },
} as const;

export interface ApplyToolOptions {
  name: string;
  /** The sidecar family: POST /api/agent/<family>/plan and /apply. */
  family: string;
  group: AgentToolGroup;
  title: string;
  description: string;
  /** The spec's properties, normally generated from the C# spec type into schemas/<name>.input.json. */
  spec: { properties: Record<string, object>; required?: string[] };
  /** The approval dialog title after "An agent wants to". */
  describe?(args: Record<string, unknown>, plan: PlanPreview): string;
  summarize?(args: Record<string, unknown>): string;
  /** A long apply, such as an import: the server reports progress at its start and end. */
  reportsProgress?: boolean;
}

function specOf(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([key]) => !(key in COMMON_PROPERTIES)));
}

/**
 * Makes an apply tool. Its effect comes from the plan the sidecar builds; the user approves that plan, and apply
 * sends the plan's hash so the sidecar runs only what was approved.
 */
export function applyTool(options: ApplyToolOptions): AgentTool {
  for (const key of Object.keys(COMMON_PROPERTIES)) {
    if (key in options.spec.properties) throw new Error(`"${options.name}" spec must not define "${key}"`);
  }
  const base = `/api/agent/${options.family}`;
  return {
    name: options.name,
    group: options.group,
    title: options.title,
    description: options.description,
    inputSchema: {
      type: "object",
      properties: { ...options.spec.properties, ...COMMON_PROPERTIES },
      ...(options.spec.required?.length ? { required: options.spec.required } : {}),
      additionalProperties: false,
    },
    outputSchema: APPLY_RESULT_SCHEMA,
    async plan(args, ctx) {
      const conn = await ctx.resolveConnection(args.connection as string | undefined);
      const plan = await ctx.callSidecar(conn, "POST", `${base}/plan`, specOf(args), ctx.signal);
      if (!isPlanPreview(plan)) throw new AgentToolError("Internal", "The Power Tools sidecar answered an invalid plan");
      return plan;
    },
    describePlan: (args, plan) =>
      options.describe?.(args, plan) ?? `${options.title.toLowerCase()} (${plan.steps.length} step${plan.steps.length === 1 ? "" : "s"})`,
    summarize: options.summarize,
    ...(options.reportsProgress ? { reportsProgress: true } : {}),
    async run(args, ctx) {
      if (!ctx.approvedPlan) throw new AgentToolError("Internal", "An apply ran without an approved plan");
      const conn = await ctx.resolveConnection(args.connection as string | undefined);
      const result = await ctx.callSidecar(conn, "POST", `${base}/apply`, { spec: specOf(args), planHash: ctx.approvedPlan.hash }, ctx.signal);
      if (!isApplyResult(result)) throw new AgentToolError("Internal", "The Power Tools sidecar answered an invalid result");
      return applyToolResult(result);
    },
  };
}
