import { describe, expect, it } from "vitest";

import {
  defaultViewSort,
  defaultWorkflowSort,
  filterWorkflows,
  nextSort,
  sortErrors,
  sortViews,
  sortWorkflows,
} from "../../model/view";
import { accountViewsFixture, workflowsFixture } from "../fixtures";

const names = new Map([
  ["account", "Account"],
  ["contact", "Contact"],
]);

describe("bulk workflow view helpers", () => {
  it("filters workflows by name, logical name and display name", () => {
    expect(filterWorkflows(workflowsFixture.workflows, "approve", names).map((w) => w.name)).toEqual(["Approve account"]);
    expect(filterWorkflows(workflowsFixture.workflows, "Contact", names).map((w) => w.name)).toEqual(["Recalculate contact"]);
    expect(filterWorkflows(workflowsFixture.workflows, "", names)).toHaveLength(2);
  });

  it("toggles sort direction on the same column", () => {
    const desc = nextSort(defaultWorkflowSort, "name");
    expect(desc).toEqual({ key: "name", direction: "desc" });
    expect(nextSort(desc, "mode")).toEqual({ key: "mode", direction: "asc" });
    expect(sortWorkflows(workflowsFixture.workflows, desc, names).map((w) => w.name)).toEqual([
      "Recalculate contact",
      "Approve account",
    ]);
    expect(sortWorkflows(workflowsFixture.workflows, { key: "mode", direction: "asc" }, names)[0].mode).toBe("background");
  });

  it("lists system views before personal views by default", () => {
    expect(sortViews(accountViewsFixture.views, defaultViewSort).map((v) => v.name)).toEqual([
      "Active Accounts",
      "My Accounts",
    ]);
    expect(
      sortViews(accountViewsFixture.views, { key: "type", direction: "desc" }).map((v) => v.kind),
    ).toEqual(["personal", "system"]);
  });

  it("sorts errors only when asked", () => {
    const rows = [
      { recordId: "b", message: "x" },
      { recordId: "a", message: "y" },
    ];
    expect(sortErrors(rows, null).map((r) => r.recordId)).toEqual(["b", "a"]);
    expect(sortErrors(rows, { key: "recordId", direction: "asc" }).map((r) => r.recordId)).toEqual(["a", "b"]);
  });
});
