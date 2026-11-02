import { describe, expect, it } from "vitest";
import { changedFields, definitionFormOf } from "../../model/definitionForm";
import { creatableTypes, valueReadOnlyReason, VARIABLE_TYPE } from "../../model/types";
import {
  DEFAULT_SORT,
  filterVariables,
  invalidCount,
  nextSort,
  pendingEdits,
  reconcileDrafts,
  saveToast,
  sortVariables,
  statusText,
} from "../../model/view";
import { apiUrlId, managedId, retriesId, variablesFixture } from "../fixtures";

describe("variable list view", () => {
  it("filters on display name, schema name, and the value in effect", () => {
    const list = variablesFixture();
    expect(filterVariables(list, "retries").map((v) => v.definitionId)).toEqual([retriesId]);
    expect(filterVariables(list, "FABRIKAM_").map((v) => v.definitionId)).toEqual([managedId]);
    expect(filterVariables(list, "api.example").map((v) => v.definitionId)).toEqual([apiUrlId]);
    // Retries has no value row, so its default value is searched.
    expect(filterVariables(list, "3").map((v) => v.definitionId)).toContain(retriesId);
  });

  it("sorts ascending, then descending on a second click", () => {
    const list = variablesFixture();
    expect(sortVariables(list, DEFAULT_SORT).map((v) => v.displayName)[0]).toBe("API URL");
    const desc = nextSort(DEFAULT_SORT, "displayName");
    expect(desc.direction).toBe("desc");
    expect(sortVariables(list, desc).map((v) => v.displayName)[0]).toBe("Settings");
    expect(nextSort(desc, "type")).toEqual({ key: "type", direction: "asc" });
  });

  it("collects edits that differ from the stored value and counts invalid ones", () => {
    const list = variablesFixture();
    const drafts = { [apiUrlId]: "https://api.example.test", [retriesId]: "many" };
    expect(pendingEdits(list, drafts)).toEqual([{ definitionId: retriesId, valueId: null, value: "many" }]);
    expect(invalidCount(list, drafts)).toBe(1);
  });

  it("keeps edits for rows that still exist after a reload", () => {
    const list = variablesFixture().filter((v) => v.definitionId !== retriesId);
    const kept = reconcileDrafts(list, { [apiUrlId]: "https://new.example.test", [retriesId]: "5" });
    expect(kept).toEqual({ [apiUrlId]: "https://new.example.test" });
  });

  it("writes status and toast text", () => {
    expect(statusText({ total: 42, shown: 42, filtered: false, unsaved: 0, saving: null })).toBe("42 variables");
    expect(statusText({ total: 42, shown: 42, filtered: false, unsaved: 3, saving: null })).toBe(
      "42 variables · 3 unsaved",
    );
    expect(statusText({ total: 42, shown: 12, filtered: true, unsaved: 0, saving: null })).toBe("12 of 42 variables");
    expect(statusText({ total: 42, shown: 42, filtered: false, unsaved: 7, saving: { done: 3, total: 7 } })).toBe(
      "Saving 3 of 7…",
    );
    expect(saveToast([{ definitionId: "a", valueId: "b", ok: false, error: "x" }, { definitionId: "c", valueId: "d", ok: true, error: null }]))
      .toEqual({ message: "1 of 2 values failed. Select a failed row to see why.", type: "error" });
    expect(saveToast([{ definitionId: "c", valueId: "d", ok: true, error: null }]).message).toMatch(/^1 value saved\./);
  });

  it("sends only changed definition fields", () => {
    const variable = variablesFixture()[1]!;
    const form = { ...definitionFormOf(variable), displayName: " Retry count " };
    expect(changedFields(variable, form)).toEqual({ displayName: "Retry count" });
  });

  it("leaves Data Source out of create and Secret out on premises", () => {
    expect(creatableTypes(false).map((t) => t.type)).not.toContain(VARIABLE_TYPE.dataSource);
    expect(creatableTypes(false).map((t) => t.type)).toContain(VARIABLE_TYPE.secret);
    expect(creatableTypes(true).map((t) => t.type)).not.toContain(VARIABLE_TYPE.secret);
  });

  it("locks the value of a variable with two value rows", () => {
    const variable = {
      ...variablesFixture()[0]!,
      valueId: null,
      currentValue: null,
      conflictingValues: [
        { valueId: "1", value: "a", isManaged: false },
        { valueId: "2", value: "b", isManaged: false },
      ],
    };
    expect(valueReadOnlyReason(variable)).toMatch(/2 value rows/);
  });
});
