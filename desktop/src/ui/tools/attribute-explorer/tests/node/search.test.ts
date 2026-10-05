import { describe, expect, it } from "vitest";

import {
  displayLabel,
  fieldsCountLabel,
  filterAttributes,
  filterTables,
  tablesCountLabel,
} from "../../model/search";
import { accountAttributes, tablesFixture } from "../fixtures";

describe("search", () => {
  it("returns every item for a blank query", () => {
    expect(filterTables(tablesFixture.tables, "")).toHaveLength(4);
    expect(filterTables(tablesFixture.tables, "   ")).toHaveLength(4);
  });

  it("matches the display name or logical name, ignoring case", () => {
    expect(filterTables(tablesFixture.tables, "PROJECT").map((t) => t.logicalName)).toEqual([
      "new_project",
    ]);
    expect(filterTables(tablesFixture.tables, "new_").map((t) => t.logicalName)).toEqual([
      "new_project",
      "new_unlabeled",
    ]);
    expect(filterTables(tablesFixture.tables, "cont").map((t) => t.logicalName)).toEqual([
      "contact",
    ]);
  });

  it("matches a table that has no label by its logical name", () => {
    expect(filterTables(tablesFixture.tables, "unlabeled")).toHaveLength(1);
  });

  it("filters fields by display or logical name", () => {
    expect(filterAttributes(accountAttributes, "revenue").map((a) => a.logicalName)).toEqual([
      "revenue",
    ]);
    expect(filterAttributes(accountAttributes, "primary").map((a) => a.logicalName)).toEqual([
      "primarycontactid",
    ]);
    expect(filterAttributes(accountAttributes, "zzz")).toEqual([]);
  });

  it("falls back to the logical name for the label", () => {
    expect(displayLabel({ logicalName: "x", displayName: null })).toBe("x");
    expect(displayLabel({ logicalName: "x", displayName: "  " })).toBe("x");
    expect(displayLabel({ logicalName: "x", displayName: "X" })).toBe("X");
  });

  it("formats counts", () => {
    expect(tablesCountLabel(812, 812)).toBe("812");
    expect(tablesCountLabel(24, 812)).toBe("24 of 812");
    expect(fieldsCountLabel(143, 143)).toBe("143 fields");
    expect(fieldsCountLabel(1, 1)).toBe("1 field");
    expect(fieldsCountLabel(12, 143)).toBe("12 of 143");
  });
});
