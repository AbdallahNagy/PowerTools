import { randomUUID } from "node:crypto";

export interface ApprovalRequest {
  id: string;
  tool: string;
  title: string;
  connection: string;
  effect: "change" | "destructive";
  summary: string;
  removes?: string;
  args: Record<string, unknown>;
}

export type ApprovalOutcome = "auto" | "allowed" | "denied" | "timed-out" | "unavailable";

export interface ApprovalGateDeps {
  present(req: ApprovalRequest): void;
  dismiss(id: string): void;
  /** Called when a request is presented, to draw the user to the window. */
  attention(): void;
  /** How long a presented request waits for an answer. Default 5 minutes. */
  timeoutMs?: number;
}

export interface ApprovalGate {
  decide(req: Omit<ApprovalRequest, "id">, connectionAllowsChanges: boolean): Promise<ApprovalOutcome>;
  respond(id: string, allow: boolean): void;
  failAll(outcome: "unavailable"): void;
}

interface Pending {
  request: ApprovalRequest;
  resolve(outcome: ApprovalOutcome): void;
  timer?: ReturnType<typeof setTimeout>;
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
    deps.present(head.request);
    deps.attention();
  }

  function finish(entry: Pending, outcome: ApprovalOutcome) {
    const index = queue.indexOf(entry);
    if (index < 0) return;
    queue.splice(index, 1);
    if (entry.timer) {
      clearTimeout(entry.timer);
      // It was on screen; take it down (a no-op if the user answered it).
      if (outcome === "timed-out" || outcome === "unavailable") deps.dismiss(entry.request.id);
    }
    entry.resolve(outcome);
    presentHead();
  }

  return {
    decide(req, connectionAllowsChanges) {
      if (req.effect === "change" && connectionAllowsChanges) return Promise.resolve("auto");
      return new Promise<ApprovalOutcome>((resolve) => {
        queue.push({ request: { ...req, id: randomUUID() }, resolve });
        presentHead();
      });
    },

    respond(id, allow) {
      const head = queue[0];
      // Only the request on screen can be answered; an old or made-up id changes nothing.
      if (!head || head.request.id !== id || !head.timer) return;
      finish(head, allow ? "allowed" : "denied");
    },

    failAll(outcome) {
      for (const entry of [...queue]) {
        queue.splice(queue.indexOf(entry), 1);
        if (entry.timer) {
          clearTimeout(entry.timer);
          deps.dismiss(entry.request.id);
        }
        entry.resolve(outcome);
      }
    },
  };
}
