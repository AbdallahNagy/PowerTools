import { describe, expect, it } from "vitest";

import { solutionsFixture } from "../fixtures";
import { filterSolutions, sortSolutions } from "../../model/view";

describe("solution list view", () => {
  it("filters every displayed value and keeps a blank publisher out of the match", () => {
    expect(filterSolutions(solutionsFixture.solutions, "fabrikam").map((row) => row.uniqueName)).toEqual(["BetaFlows"]);
    expect(filterSolutions(solutionsFixture.solutions, "managed core").map((row) => row.uniqueName)).toEqual(["ManagedCore"]);
    expect(filterSolutions(solutionsFixture.solutions, "unmanaged").map((row) => row.uniqueName)).toEqual([
      "AlphaWidgets",
      "BetaFlows",
    ]);
    expect(filterSolutions(solutionsFixture.solutions, "2023-01-15").map((row) => row.uniqueName)).toEqual(["ManagedCore"]);
    expect(filterSolutions(solutionsFixture.solutions, "null")).toEqual([]);
  });

  it("sorts installed dates when both values parse and falls back to text otherwise", () => {
    const rows = [
      ...solutionsFixture.solutions,
      {
        ...solutionsFixture.solutions[0],
        id: "dated",
        friendlyName: "Undated",
        installedOn: "not-a-date",
      },
    ];
    expect(sortSolutions(rows, "installedOn", "asc").map((row) => row.installedOn)).toEqual([
      "2023-01-15",
      "2024-03-01",
      "2024-06-01",
      "not-a-date",
    ]);
    const textFallback = sortSolutions(
      [
        { ...rows[0], id: "a", installedOn: "zeta" },
        { ...rows[0], id: "b", installedOn: "Alpha" },
      ],
      "installedOn",
      "asc",
    );
    expect(textFallback.map((row) => row.installedOn)).toEqual(["Alpha", "zeta"]);
  });
});
