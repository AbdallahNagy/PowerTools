import { describe, expect, it } from "vitest";
import { createdUpdatedSummary, plannedAction } from "../../model/recordAction";

describe("record actions", () => {
  it("creates new records and updates existing ones when both are allowed", () => {
    expect(plannedAction("upsert", false)).toEqual({ action: "create", problem: null });
    expect(plannedAction("upsert", true)).toEqual({ action: "update", problem: null });
    expect(plannedAction("upsert", null)).toEqual({ action: null, problem: null });
  });

  it("flags records that will fail in create-only or update-only mode", () => {
    expect(plannedAction("create", false).problem).toBeNull();
    expect(plannedAction("create", true)).toMatchObject({ action: "create", problem: expect.any(String) });
    expect(plannedAction("update", true).problem).toBeNull();
    expect(plannedAction("update", false)).toMatchObject({ action: "update", problem: expect.any(String) });
    expect(plannedAction("create", null)).toEqual({ action: "create", problem: null });
  });

  it("summarizes created and updated counts", () => {
    expect(createdUpdatedSummary({ created: 3, updated: 0 })).toBe("3 created · 0 updated");
  });
});
