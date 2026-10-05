import { describe, expect, it } from "vitest";

import { DEFAULT_SORT, isSortKey, nextSort, sortAttributes } from "../../model/sort";
import { accountAttributes } from "../fixtures";

const names = (rows: ReturnType<typeof sortAttributes>) => rows.map((row) => row.logicalName);

describe("sort", () => {
  it("sorts by display name ascending by default, falling back to the logical name", () => {
    expect(names(sortAttributes(accountAttributes))).toEqual([
      "name",
      "revenue",
      "customerid",
      "donotemail",
      "industrycode",
      "new_nolabel",
      "primarycontactid",
    ]);
  });

  it("reverses the order for descending", () => {
    const ascending = names(sortAttributes(accountAttributes, { key: "displayName", direction: "asc" }));
    const descending = names(sortAttributes(accountAttributes, { key: "displayName", direction: "desc" }));
    expect(descending).toEqual([...ascending].reverse());
  });

  it("sorts by logical name", () => {
    expect(names(sortAttributes(accountAttributes, { key: "logicalName", direction: "asc" }))[0]).toBe(
      "customerid",
    );
  });

  it("sorts by friendly type label", () => {
    const sorted = sortAttributes(accountAttributes, { key: "type", direction: "asc" });
    expect(sorted[0]?.logicalName).toBe("industrycode");
    expect(sorted[sorted.length - 1]?.logicalName).toBe("donotemail");
  });

  it("sorts by required level rank, then logical name", () => {
    expect(names(sortAttributes(accountAttributes, { key: "required", direction: "desc" })).slice(0, 3)).toEqual([
      "revenue",
      "name",
      "customerid",
    ]);
  });

  it("sorts by related table with plain fields first", () => {
    const sorted = sortAttributes(accountAttributes, { key: "relatedTable", direction: "asc" });
    expect(sorted[sorted.length - 1]?.logicalName).toBe("primarycontactid");
  });

  it("does not change the input", () => {
    const copy = [...accountAttributes];
    sortAttributes(accountAttributes, { key: "type", direction: "desc" });
    expect(accountAttributes).toEqual(copy);
  });

  it("toggles direction on the active column and restarts ascending on another", () => {
    const flipped = nextSort(DEFAULT_SORT, "displayName");
    expect(flipped).toEqual({ key: "displayName", direction: "desc" });
    expect(nextSort(flipped, "displayName")).toEqual({ key: "displayName", direction: "asc" });
    expect(nextSort(flipped, "type")).toEqual({ key: "type", direction: "asc" });
  });

  it("recognizes sort keys", () => {
    expect(isSortKey("relatedTable")).toBe(true);
    expect(isSortKey("nope")).toBe(false);
  });
});
