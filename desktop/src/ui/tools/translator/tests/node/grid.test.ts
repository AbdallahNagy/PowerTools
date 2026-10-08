import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  filterByQuery,
  filterByShow,
  langSortKey,
  nextSort,
  sortRows,
} from "../../model/grid";
import { labelName } from "../../model/labels";
import { accountColumnRows, accountTableRows } from "../fixtures";

describe("translator grid", () => {
  it("shows names, descriptions, or both", () => {
    expect(filterByShow(accountTableRows, "names").map(labelName)).toEqual(["Display Name", "Plural Name"]);
    expect(filterByShow(accountTableRows, "descriptions").map(labelName)).toEqual(["Description"]);
  });

  it("filters by component names and visible language values only", () => {
    expect(filterByQuery(accountColumnRows, "createdon", [1033])).toHaveLength(1);
    expect(filterByQuery(accountColumnRows, "nom du", [1033, 1036])).toHaveLength(1);
    expect(filterByQuery(accountColumnRows, "nom du", [1033])).toHaveLength(0);
  });

  it("sorts by component then label by default, and toggles a header's direction", () => {
    const shuffled = [accountTableRows[2]!, accountTableRows[0]!, accountTableRows[1]!];
    expect(sortRows(shuffled, DEFAULT_SORT).map(labelName)).toEqual(["Display Name", "Plural Name", "Description"]);

    expect(nextSort(DEFAULT_SORT, "component")).toEqual({ key: "component", direction: "desc" });
    const byFrench = nextSort(DEFAULT_SORT, langSortKey(1036));
    expect(byFrench).toEqual({ key: "lang:1036", direction: "asc" });
    expect(nextSort(byFrench, "lang:1036").direction).toBe("desc");
    expect(sortRows(accountColumnRows, { key: "component", direction: "desc" }).map((row) => row.component)).toEqual([
      "Created On",
      "Account Name",
      "Account Name",
    ]);
  });
});
