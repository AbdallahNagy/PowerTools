import type { ApprovalPlan } from "./approval.js";
import type { PlanPreview, PlanStep } from "./types.js";

/** Most steps the dialog lists; the rest are counted. */
export const MAX_DIALOG_STEPS = 20;

const ORDER = ["destructive", "change", "unsupported"] as const;

function groupOf(step: PlanStep): (typeof ORDER)[number] {
  if (step.kind !== "run") return "unsupported";
  return step.effect === "destructive" ? "destructive" : "change";
}

/** Groups a plan for the approval dialog, destructive first, listing at most MAX_DIALOG_STEPS steps in all. */
export function planForDialog(plan: PlanPreview, limit = MAX_DIALOG_STEPS): ApprovalPlan {
  let room = limit;
  const groups = ORDER.map((effect) => {
    const all = plan.steps.filter((step) => groupOf(step) === effect);
    const shown = all.slice(0, Math.max(0, room));
    room -= shown.length;
    return {
      effect,
      count: all.length,
      steps: shown.map((step) => {
        const detail = step.kind === "run" ? step.detail : [step.reason, step.route && `Instead: ${step.route}`].filter(Boolean).join(" ");
        return { op: step.op, target: step.target, ...(detail ? { detail } : {}) };
      }),
    };
  }).filter((group) => group.count > 0);
  return {
    hash: plan.hash,
    total: plan.steps.length,
    groups,
    hidden: plan.steps.length - groups.reduce((sum, group) => sum + group.steps.length, 0),
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
