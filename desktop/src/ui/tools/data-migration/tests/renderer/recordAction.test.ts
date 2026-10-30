import { describe, expect, it } from "vitest";
import { createdUpdatedSummary, plannedAction, totalActionsSummary } from "../../model/recordAction";

const both = { create: true, update: true, delete: false };
const createOnly = { create: true, update: false, delete: false };
const updateOnly = { create: false, update: true, delete: false };
const deleteOnly = { create: false, update: false, delete: true };

describe("record actions", () => {
  it("creates new records and updates existing ones when both are allowed", () => {
    expect(plannedAction(both, false)).toBe("create");
    expect(plannedAction(both, true)).toBe("update");
    expect(plannedAction(both, null)).toBeNull();
  });

  it("skips records the options do not cover instead of failing them", () => {
    expect(plannedAction(createOnly, false)).toBe("create");
    expect(plannedAction(createOnly, true)).toBe("skip");
    expect(plannedAction(updateOnly, true)).toBe("update");
    expect(plannedAction(updateOnly, false)).toBe("skip");
    expect(plannedAction(deleteOnly, true)).toBe("skip");
    expect(plannedAction(deleteOnly, false)).toBe("skip");
  });

  it("knows the action without a target when only one option is on", () => {
    expect(plannedAction(createOnly, null)).toBe("create");
    expect(plannedAction(updateOnly, null)).toBe("update");
    expect(plannedAction(deleteOnly, null)).toBe("skip");
  });

  it("summarizes created and updated counts, and skipped and deleted when there are any", () => {
    expect(createdUpdatedSummary({ created: 3, updated: 0, skipped: 0, deleted: 0 })).toBe("3 created · 0 updated");
    expect(createdUpdatedSummary({ created: 3, updated: 1, skipped: 2, deleted: 4 })).toBe(
      "3 created · 1 updated · 2 skipped · 4 deleted",
    );
  });

  it("summarizes the actions for all records in the target", () => {
    expect(totalActionsSummary(both, 10, 4)).toBe("6 to create · 4 to update");
    expect(totalActionsSummary(both, 10, null)).toBeNull();
    expect(totalActionsSummary(createOnly, 10, 0)).toBe("10 to create");
    expect(totalActionsSummary(createOnly, 10, 4)).toBe("6 to create · 4 skipped (already in the target)");
    expect(totalActionsSummary(updateOnly, 10, 10)).toBe("10 to update");
    expect(totalActionsSummary(updateOnly, 10, 4)).toBe("4 to update · 6 skipped (not in the target)");
    expect(totalActionsSummary(deleteOnly, 10, 4)).toBe("10 skipped (Create and Update are off)");
  });
});
