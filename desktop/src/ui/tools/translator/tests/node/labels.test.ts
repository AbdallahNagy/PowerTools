import { describe, expect, it } from "vitest";
import {
  GLOBAL_SCOPE,
  labelName,
  languageHeader,
  orderLanguages,
  rowId,
  scopeOf,
  tabOf,
} from "../../model/labels";
import { globalRows } from "../fixtures";

describe("translator labels", () => {
  it("names labels as the UX lists them", () => {
    expect(labelName({ key: { kind: "table", property: "DisplayCollectionName" }, booleanSet: false })).toBe(
      "Plural Name",
    );
    expect(labelName({ key: { kind: "boolean", value: 0, property: "Label" }, booleanSet: false })).toBe(
      "False Label",
    );
    expect(labelName({ key: { kind: "relationship", property: "Label" }, booleanSet: false })).toBe("Menu Label");
    expect(labelName(globalRows[0]!)).toBe("Display Name");
    expect(labelName(globalRows[1]!)).toBe("Option Label");
    expect(labelName(globalRows[2]!)).toBe("True Label");
  });

  it("builds the same row id for equal keys and separates scopes", () => {
    const key = { kind: "view" as const, table: "account", recordId: "ABC", property: "name" as const };
    expect(rowId(key)).toBe(rowId({ ...key, recordId: "abc" }));
    expect(rowId(key)).not.toBe(rowId({ ...key, property: "description" }));
    expect(scopeOf(globalRows[0]!.key)).toBe(GLOBAL_SCOPE);
    expect(tabOf({ kind: "boolean", table: "account", property: "Label" })).toBe("boolean");
  });

  it("puts the base language first and formats headers", () => {
    const ordered = orderLanguages(
      [
        { lcid: 1036, name: "French" },
        { lcid: 1031, name: "German" },
        { lcid: 1033, name: "English" },
      ],
      1036,
    );
    expect(ordered.map((language) => language.lcid)).toEqual([1036, 1033, 1031]);
    expect(languageHeader({ lcid: 1033, name: "English" })).toBe("English (1033)");
    expect(languageHeader({ lcid: 3082, name: "LCID 3082" })).toBe("LCID 3082");
  });
});
