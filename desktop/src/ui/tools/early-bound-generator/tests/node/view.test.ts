import { describe, expect, it } from "vitest";

import { tablesFixture } from "../fixtures";
import { filterTables, isValidNamespace, setSelection } from "../../model/view";

describe("early bound generator view", () => {
  it("filters by display, logical, or schema name", () => {
    const names = (query: string) =>
      filterTables(tablesFixture.tables, query).map((table) => table.logicalName);

    expect(names("")).toEqual(["account", "contact", "new_project"]);
    expect(names("PROJ")).toEqual(["new_project"]);
    expect(names("new_Pro")).toEqual(["new_project"]);
    expect(names("zzz")).toEqual([]);
  });

  it("accepts dotted C# namespaces only", () => {
    expect(isValidNamespace("Contoso.Model")).toBe(true);
    expect(isValidNamespace(" Contoso ")).toBe(true);
    expect(isValidNamespace("")).toBe(false);
    expect(isValidNamespace("Contoso..Model")).toBe(false);
    expect(isValidNamespace("1Contoso")).toBe(false);
    expect(isValidNamespace("Contoso Model")).toBe(false);
  });

  it("adds and removes tables without touching the rest", () => {
    const start = new Set(["account"]);

    expect([...setSelection(start, ["contact", "new_project"], true)]).toEqual([
      "account",
      "contact",
      "new_project",
    ]);
    expect([...setSelection(start, ["account"], false)]).toEqual([]);
    expect([...start]).toEqual(["account"]);
  });
});
