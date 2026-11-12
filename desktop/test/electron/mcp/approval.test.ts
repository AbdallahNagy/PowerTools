import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApprovalGate, type ApprovalRequest } from "../../../src/electron/mcp/approval";

type Draft = Omit<ApprovalRequest, "id">;

function draft(over: Partial<Draft> = {}): Draft {
  return {
    tool: "records_update",
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
