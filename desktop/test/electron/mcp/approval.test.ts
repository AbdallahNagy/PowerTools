import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApprovalGate, type ApprovalRequest } from "../../../src/electron/mcp/approval";

type Draft = Omit<ApprovalRequest, "id">;

function draft(over: Partial<Draft> = {}): Draft {
  return {
    tool: "records_write",
    title: "Update record",
    connection: "A · Dev",
    effect: "change",
    summary: "update an account",
    args: { table: "account" },
    ...over,
  };
}

function setup(timeoutMs?: number) {
  const presented: ApprovalRequest[] = [];
  const dismissed: string[] = [];
  const attention = vi.fn();
  const gate = createApprovalGate({
    present: (r) => void presented.push(r),
    dismiss: (id) => void dismissed.push(id),
    attention,
    timeoutMs,
  });
  return { gate, presented, dismissed, attention };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("approval cancelled by the client", () => {
  it("drops a queued request without disturbing the one on screen", async () => {
    const { gate, presented, dismissed } = setup();
    const first = gate.decide(draft({ summary: "first" }), false);
    const controller = new AbortController();
    const second = gate.decide(draft({ summary: "second" }), false, controller.signal);
    const third = gate.decide(draft({ summary: "third" }), false);

    controller.abort();

    await expect(second).resolves.toBe("cancelled");
    expect(dismissed).toEqual([]);
    gate.respond(presented[0].id, true);
    await expect(first).resolves.toBe("allowed");
    expect(presented.map((r) => r.summary)).toEqual(["first", "third"]);
    gate.respond(presented[1].id, false);
    await expect(third).resolves.toBe("denied");
  });

  it("dismisses the dialog on screen and presents the next request", async () => {
    const { gate, presented, dismissed } = setup();
    const controller = new AbortController();
    const first = gate.decide(draft({ summary: "first" }), false, controller.signal);
    const second = gate.decide(draft({ summary: "second" }), false);

    controller.abort();

    await expect(first).resolves.toBe("cancelled");
    expect(dismissed).toEqual([presented[0].id]);
    expect(presented.map((r) => r.summary)).toEqual(["first", "second"]);
    gate.respond(presented[0].id, true); // the old id no longer counts
    gate.respond(presented[1].id, true);
    await expect(second).resolves.toBe("allowed");
  });

  it("is cancelled at once when the signal is already aborted, and never presented", async () => {
    const { gate, presented } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(gate.decide(draft(), false, controller.signal)).resolves.toBe("cancelled");
    expect(presented).toHaveLength(0);
  });

  it("ignores an abort after the user answered", async () => {
    const { gate, presented, dismissed } = setup();
    const controller = new AbortController();
    const result = gate.decide(draft(), false, controller.signal);
    gate.respond(presented[0].id, true);
    await expect(result).resolves.toBe("allowed");
    controller.abort();
    expect(dismissed).toEqual([]);
  });
});

describe("approval gate", () => {
  it("lets a change through automatically when the connection allows changes", async () => {
    const { gate, presented } = setup();
    await expect(gate.decide(draft(), true)).resolves.toBe("auto");
    expect(presented).toHaveLength(0);
  });

  it("asks for a change when the connection does not allow changes", async () => {
    const { gate, presented, attention } = setup();
    const result = gate.decide(draft(), false);
    expect(presented).toHaveLength(1);
    expect(attention).toHaveBeenCalledTimes(1);
    gate.respond(presented[0].id, true);
    await expect(result).resolves.toBe("allowed");
  });

  it("still asks for a destructive call when the switch is on", async () => {
    const { gate, presented } = setup();
    const result = gate.decide(draft({ effect: "destructive", removes: "record account 1" }), true);
    expect(presented).toHaveLength(1);
    gate.respond(presented[0].id, false);
    await expect(result).resolves.toBe("denied");
  });

  it("presents queued requests one at a time, in order, and never applies one answer to two", async () => {
    const { gate, presented } = setup();
    const first = gate.decide(draft({ summary: "first" }), false);
    const second = gate.decide(draft({ summary: "second" }), false);
    expect(presented.map((r) => r.summary)).toEqual(["first"]);

    gate.respond(presented[0].id, true);
    await expect(first).resolves.toBe("allowed");
    expect(presented.map((r) => r.summary)).toEqual(["first", "second"]);

    // The first id no longer counts, so it cannot answer the second.
    gate.respond(presented[0].id, true);
    let settled = false;
    void second.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    gate.respond(presented[1].id, false);
    await expect(second).resolves.toBe("denied");
  });

  it("ignores an unknown id", async () => {
    const { gate, presented } = setup();
    const result = gate.decide(draft(), false);
    gate.respond("nope", true);
    gate.respond(presented[0].id, false);
    await expect(result).resolves.toBe("denied");
  });

  it("times out, dismisses the dialog and moves on", async () => {
    const { gate, presented, dismissed } = setup(1000);
    const first = gate.decide(draft({ summary: "first" }), false);
    const second = gate.decide(draft({ summary: "second" }), false);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(first).resolves.toBe("timed-out");
    expect(dismissed).toEqual([presented[0].id]);
    expect(presented.map((r) => r.summary)).toEqual(["first", "second"]);
    gate.respond(presented[1].id, true);
    await expect(second).resolves.toBe("allowed");
  });

  it("defaults to a five minute timeout", async () => {
    const { gate } = setup();
    const result = gate.decide(draft(), false);
    await vi.advanceTimersByTimeAsync(299_999);
    let settled = false;
    void result.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("timed-out");
  });

  it("failAll resolves everything pending as unavailable and dismisses the open dialog", async () => {
    const { gate, presented, dismissed } = setup();
    const a = gate.decide(draft(), false);
    const b = gate.decide(draft(), false);
    gate.failAll("unavailable");
    await expect(a).resolves.toBe("unavailable");
    await expect(b).resolves.toBe("unavailable");
    expect(dismissed).toEqual([presented[0].id]);
    expect(presented).toHaveLength(1);
  });
});

describe("approval for a window that was not listening", () => {
  it("hands out the request on screen, and none once it is answered", async () => {
    const { gate, presented } = setup();
    expect(gate.current()).toBeNull();
    const first = gate.decide(draft({ summary: "first" }), false);
    void gate.decide(draft({ summary: "second" }), false);

    // Only the request on screen, never the one queued behind it.
    expect(gate.current()).toEqual(presented[0]);
    gate.respond(presented[0].id, true);
    await expect(first).resolves.toBe("allowed");
    expect(gate.current()?.summary).toBe("second");
  });

  it("refuses a request it cannot show at once, so the queue behind it moves on", async () => {
    let fail = true;
    const presented: ApprovalRequest[] = [];
    const gate = createApprovalGate({
      present: (r) => {
        if (fail) throw new ReferenceError("window not created yet");
        presented.push(r);
      },
      dismiss: () => undefined,
      attention: () => undefined,
    });

    await expect(gate.decide(draft({ summary: "first" }), false)).resolves.toBe("unavailable");
    fail = false;
    const second = gate.decide(draft({ summary: "second" }), false);
    expect(presented.map((r) => r.summary)).toEqual(["second"]);
    gate.respond(presented[0].id, true);
    await expect(second).resolves.toBe("allowed");
  });
});

describe("approval when the window itself fails", () => {
  it("settles every call and moves the queue on when both showing and taking down throw", async () => {
    let failFrom = 2;
    let shown = 0;
    const presented: ApprovalRequest[] = [];
    const gate = createApprovalGate({
      present: (r) => {
        if (++shown >= failFrom) throw new Error("window gone");
        presented.push(r);
      },
      dismiss: () => {
        throw new Error("window gone");
      },
      attention: () => undefined,
    });
    const first = gate.decide(draft({ summary: "first" }), false);
    const second = gate.decide(draft({ summary: "second" }), false);
    const third = gate.decide(draft({ summary: "third" }), false);

    gate.respond(presented[0].id, true);
    await expect(first).resolves.toBe("allowed");
    await expect(second).resolves.toBe("unavailable");
    await expect(third).resolves.toBe("unavailable");
    failFrom = Infinity;
  });

  it("keeps a request on screen when drawing attention fails", async () => {
    const presented: ApprovalRequest[] = [];
    const gate = createApprovalGate({
      present: (r) => void presented.push(r),
      dismiss: () => undefined,
      attention: () => {
        throw new Error("no notifications");
      },
    });
    const first = gate.decide(draft(), false);
    gate.respond(presented[0].id, true);
    await expect(first).resolves.toBe("allowed");
  });
});
