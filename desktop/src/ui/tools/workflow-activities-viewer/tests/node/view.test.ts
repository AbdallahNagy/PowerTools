import { describe, expect, it } from "vitest";

import { activitiesFixture } from "../fixtures";
import {
  activityTotals,
  filterAssemblies,
  formatTimestamp,
  isGroupExpanded,
  startConditionsText,
} from "../../model/view";

describe("workflow activity view", () => {
  it("matches activity names and leaves assembly names out of the filter", () => {
    const matches = filterAssemblies(activitiesFixture.assemblies, "contoso");
    expect(matches.map((group) => group.name)).toEqual(["A.Shared"]);
    expect(matches[0]?.activities.map((activity) => activity.name)).toEqual(["Contoso helper"]);

    const reminder = filterAssemblies(activitiesFixture.assemblies, "REMINDER");
    expect(reminder.map((group) => group.name)).toEqual(["Contoso.Activities"]);
    expect(reminder[0]?.activities.map((activity) => activity.name)).toEqual(["Send reminder"]);
  });

  it("expands only while the filter has text", () => {
    expect(isGroupExpanded("assembly-a", "", new Set())).toBe(false);
    expect(isGroupExpanded("assembly-a", "", new Set(["assembly-a"]))).toBe(true);
    expect(isGroupExpanded("assembly-a", "note", new Set())).toBe(true);
  });

  it("counts loaded activities and formats start conditions in order", () => {
    expect(activityTotals(activitiesFixture.assemblies)).toEqual({ activities: 3, assemblies: 2 });
    expect(formatTimestamp("2024-03-15T14:30:00.000Z")).toBe("2024-03-15 14:30");
    expect(formatTimestamp(null)).toBeNull();
    expect(startConditionsText({
      onDemand: true,
      triggerOnCreate: true,
      triggerOnDelete: true,
      triggerOnUpdateAttributes: ["statuscode", "ownerid"],
    })).toBe("On demand, Record created, Columns changed: statuscode, ownerid, Record deleted");
    expect(startConditionsText({
      onDemand: false,
      triggerOnCreate: false,
      triggerOnDelete: false,
      triggerOnUpdateAttributes: [],
    })).toBe("No start conditions");
  });
});
