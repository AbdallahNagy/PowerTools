import { TriangleAlert } from "lucide-react";

import type { McpApprovalPlan } from "../../platform/desktopBridge";
import { Button, Modal } from "../../shared/ui";
import { useApprovalRequests } from "./useApprovalRequests";

/**
 * Asks the user about one agent call at a time. Closing it any way other than Allow means Deny.
 * The arguments are agent-written, so they are only ever shown as text.
 */
export function ApprovalDialog() {
  const { current, respond } = useApprovalRequests();
  if (!current) return null;

  const destructive = current.effect === "destructive";
  return (
    <Modal
      open
      title={`An agent wants to ${current.summary}`}
      onClose={() => respond(current.id, false)}
      widthClass="max-w-lg"
      zClass="z-[60]"
    >
      <div className="flex flex-col gap-1 text-sm text-fg">
        <p>Connection: {current.connection}</p>
        <p>Tool: {current.title}</p>
      </div>

      {destructive ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-sm border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            This removes {current.removes ?? "data"} from {current.connection}. It cannot be undone.
          </p>
        </div>
      ) : null}

      {current.plan ? <PlanSteps plan={current.plan} /> : null}

      <details className="text-xs text-fg-muted">
        <summary className="cursor-pointer select-none">{current.plan ? "Spec" : "Arguments"}</summary>
        <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-sm border border-line bg-canvas p-2 font-mono text-fg">
          {JSON.stringify(current.args, null, 2)}
        </pre>
      </details>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" autoFocus onClick={() => respond(current.id, false)}>
          Deny
        </Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={() => respond(current.id, true)}>
          Allow
        </Button>
      </div>
    </Modal>
  );
}

const COUNT_LABEL: Array<[keyof McpApprovalPlan["counts"], string]> = [
  ["destructive", "removes or replaces"],
  ["change", "changes"],
  ["unsupported", "cannot run here"],
];

const STEP_CLASS: Record<McpApprovalPlan["steps"][number]["effect"], string> = {
  destructive: "text-danger",
  change: "",
  unsupported: "text-fg-muted",
};

/** The steps an apply tool will run, in run order. Step text comes from the environment and the agent: text only. */
function PlanSteps({ plan }: { plan: McpApprovalPlan }) {
  const kinds = COUNT_LABEL.filter(([key]) => plan.counts[key] > 0).map(([key, label]) => `${plan.counts[key]} ${label}`);
  return (
    <section aria-label="Plan" className="flex flex-col gap-2 text-sm text-fg">
      <p>
        {plan.total} step{plan.total === 1 ? "" : "s"} in run order
        {plan.hidden > 0 ? `, the first ${plan.total - plan.hidden} shown` : ""}
        {kinds.length > 0 ? `: ${kinds.join(", ")}` : ""}
      </p>
      <ol className="flex max-h-72 list-decimal flex-col gap-0.5 overflow-auto pl-6 font-mono text-xs">
        {plan.steps.map((step, index) => (
          <li key={`${step.op}-${step.target}-${index}`} className={`break-all ${STEP_CLASS[step.effect]}`}>
            {step.effect === "destructive" ? "Removes or replaces: " : step.effect === "unsupported" ? "Cannot run: " : ""}
            {step.op} {step.target}
            {/* A detail can span lines, such as each operation of an all-or-nothing records_write. */}
            {step.detail ? <span className="whitespace-pre-line text-fg-muted"> · {step.detail}</span> : null}
          </li>
        ))}
        {plan.hidden > 0 ? <li className="list-none text-fg-muted">and {plan.hidden} more</li> : null}
      </ol>
      {plan.stopsAt !== undefined ? (
        <p className="text-xs text-danger">
          The apply stops at step {plan.stopsAt + 1}, which cannot run. The steps before it run; the steps after it do not.
        </p>
      ) : null}
      {plan.warnings.map((warning) => (
        <p key={warning} className="text-xs text-fg-muted">
          {warning}
        </p>
      ))}
    </section>
  );
}
