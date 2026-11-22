import { randomUUID } from "node:crypto";

export interface ApprovalRequest {
  id: string;
  tool: string;
  title: string;
  connection: string;
  effect: "change" | "destructive";
  summary: string;
  removes?: string;
  /** For apply tools: the steps the user approves, grouped for the dialog. */
  plan?: ApprovalPlan;
  args: Record<string, unknown>;
}

/** A plan as the approval dialog shows it: steps in run order, long plans cut to the first steps plus counts. */
export interface ApprovalPlan {
  hash: string;
  total: number;
  /** The first steps, in the order they run. */
  steps: Array<{ op: string; target: string; effect: "destructive" | "change" | "unsupported"; detail?: string }>;
  /** How many steps of each kind the whole plan has. */
  counts: { destructive: number; change: number; unsupported: number };
  /** Steps not listed because the plan is long. */
  hidden: number;
  /** Index of the first step that cannot run, when steps follow it: the apply stops there and they do not run. */
  stopsAt?: number;
  warnings: string[];
}

export type ApprovalOutcome = "auto" | "allowed" | "denied" | "timed-out" | "unavailable" | "cancelled";

export interface ApprovalGateDeps {
  present(req: ApprovalRequest): void;
  dismiss(id: string): void;
  /** Called when a request is presented, to draw the user to the window. */
  attention(): void;
  /** How long a presented request waits for an answer. Default 5 minutes. */
  timeoutMs?: number;
}

export interface ApprovalGate {
  /** `signal` is the client's: aborting it takes the request out of the queue or off the screen. */
  decide(req: Omit<ApprovalRequest, "id">, connectionAllowsChanges: boolean, signal?: AbortSignal): Promise<ApprovalOutcome>;
  respond(id: string, allow: boolean): void;
  failAll(outcome: "unavailable"): void;
  /** The request on screen, if any, so a window that loaded after it was presented can show it. */
  current(): ApprovalRequest | null;
}

interface Pending {
  request: ApprovalRequest;
  resolve(outcome: ApprovalOutcome): void;
  timer?: ReturnType<typeof setTimeout>;
  stopListening?: () => void;
}

/**
 * Decides whether an agent call may run. Only a change on a connection that allows changes skips the
 * user; everything else is queued and shown one request at a time, so one answer never covers two calls.
 */
export function createApprovalGate(deps: ApprovalGateDeps): ApprovalGate {
  const timeoutMs = deps.timeoutMs ?? 300_000;
  const queue: Pending[] = [];

  function presentHead() {
    const head = queue[0];
    if (!head || head.timer) return;
    head.timer = setTimeout(() => finish(head, "timed-out"), timeoutMs);
    try {
      deps.present(head.request);
    } catch {
      // A request that cannot be shown must not hold the queue until it times out. It was never on screen, so
      // there is nothing to take down.
      clearTimeout(head.timer);
      head.timer = undefined;
      finish(head, "unavailable");
      return;
    }
    try {
      deps.attention();
    } catch {
      // Drawing attention is a courtesy; the request is on screen either way.
    }
  }

  function finish(entry: Pending, outcome: ApprovalOutcome) {
    const index = queue.indexOf(entry);
    if (index < 0) return;
    queue.splice(index, 1);
    entry.stopListening?.();
    if (entry.timer) {
      clearTimeout(entry.timer);
      // It was on screen; take it down (a no-op if the user answered it).
      if (outcome === "timed-out" || outcome === "unavailable" || outcome === "cancelled") {
        try {
          deps.dismiss(entry.request.id);
        } catch {
          // A window that is gone cannot show it anyway; the call must still settle and the queue move on.
        }
      }
    }
    entry.resolve(outcome);
    presentHead();
  }

  return {
    decide(req, connectionAllowsChanges, signal) {
      if (signal?.aborted) return Promise.resolve("cancelled");
      if (req.effect === "change" && connectionAllowsChanges) return Promise.resolve("auto");
      return new Promise<ApprovalOutcome>((resolve) => {
        const entry: Pending = { request: { ...req, id: randomUUID() }, resolve };
        if (signal) {
          const onAbort = () => finish(entry, "cancelled");
          signal.addEventListener("abort", onAbort, { once: true });
          entry.stopListening = () => signal.removeEventListener("abort", onAbort);
        }
        queue.push(entry);
        presentHead();
      });
    },

    respond(id, allow) {
      const head = queue[0];
      // Only the request on screen can be answered; an old or made-up id changes nothing.
      if (!head || head.request.id !== id || !head.timer) return;
      finish(head, allow ? "allowed" : "denied");
    },

    current() {
      const head = queue[0];
      return head?.timer ? head.request : null;
    },

    failAll(outcome) {
      for (const entry of [...queue]) {
        queue.splice(queue.indexOf(entry), 1);
        entry.stopListening?.();
        if (entry.timer) {
          clearTimeout(entry.timer);
          deps.dismiss(entry.request.id);
        }
        entry.resolve(outcome);
      }
    },
  };
}
