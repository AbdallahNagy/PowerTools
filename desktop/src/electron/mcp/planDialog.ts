import type { ApprovalPlan } from "./approval.js";
import type { PlanPreview, PlanStep } from "./types.js";

/** Most steps the dialog lists; the rest are counted. */
export const MAX_DIALOG_STEPS = 20;

type DialogEffect = ApprovalPlan["steps"][number]["effect"];

function effectOf(step: PlanStep): DialogEffect {
  if (step.kind !== "run") return "unsupported";
  return step.effect === "destructive" ? "destructive" : "change";
}

/**
 * The plan as the approval dialog shows it: the steps in the order they run, at most MAX_DIALOG_STEPS of them, and
 * how many of each kind. Run order matters: a step that cannot run stops the apply, and the user must see which
 * changes run before it.
 */
export function planForDialog(plan: PlanPreview, limit = MAX_DIALOG_STEPS): ApprovalPlan {
  const counts = { destructive: 0, change: 0, unsupported: 0 };
  for (const step of plan.steps) counts[effectOf(step)] += 1;
  const steps = plan.steps.slice(0, Math.max(0, limit)).map((step) => {
    const detail = step.kind === "run" ? step.detail : [step.reason, step.route && `Instead: ${step.route}`].filter(Boolean).join(" ");
    return { op: step.op, target: step.target, effect: effectOf(step), ...(detail ? { detail } : {}) };
  });
  const firstStop = plan.steps.findIndex((step) => step.kind !== "run");
  return {
    hash: plan.hash,
    total: plan.steps.length,
    steps,
    counts,
    hidden: plan.steps.length - steps.length,
    ...(firstStop >= 0 && firstStop < plan.steps.length - 1 ? { stopsAt: firstStop } : {}),
    warnings: plan.warnings,
  };
}

/** What the destructive warning names: "con_budget, con_stage and 3 more". */
export function planRemoves(plan: PlanPreview): string | undefined {
  const targets = plan.steps.filter((s) => s.kind === "run" && s.effect === "destructive").map((s) => s.target);
  if (targets.length === 0) return undefined;
  const named = targets.slice(0, 3).join(", ");
  return targets.length > 3 ? `${named} and ${targets.length - 3} more` : named;
}
