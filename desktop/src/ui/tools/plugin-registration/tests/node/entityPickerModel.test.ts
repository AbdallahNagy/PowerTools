import { describe, expect, it } from "vitest";

import {
  buildEntityPickerOptions,
  entityDisplayName,
  entityLogicalName,
  entityOptionLabel,
  entitySearchText,
  isPresentTable,
  toEntityOption,
} from "../../components/entityPickerModel";

const entities = new Map([
  ["account", { logicalName: "account", displayName: "Account" }],
  ["contact", { logicalName: "contact", displayName: "Contact" }],
]);

describe("entity picker labels", () => {
  it("hides a none secondary table beside the entity name", () => {
    const option = {
      id: "filter-account",
      logicalName: "account",
      displayName: "Account",
      secondaryLogicalName: "none",
      secondaryDisplayName: "none",
    };

    expect(isPresentTable("none")).toBe(false);
    expect(isPresentTable("None")).toBe(false);
    expect(isPresentTable(null)).toBe(false);
    expect(entityDisplayName(option)).toBe("Account");
    expect(entityLogicalName(option)).toBe("account");
    expect(entityOptionLabel(option)).toBe("Account account");
    expect(entitySearchText(option)).not.toContain("none");
  });

  it("keeps a real related table in the entity name", () => {
    const option = {
      id: "filter-related",
      logicalName: "account",
      displayName: "Account",
      secondaryLogicalName: "contact",
      secondaryDisplayName: "Contact",
    };

    expect(isPresentTable("contact")).toBe(true);
    expect(entityDisplayName(option)).toBe("Account · Contact");
    expect(entityLogicalName(option)).toBe("account · contact");
  });

  it("labels an any-table filter as None without a suffix", () => {
    const option = {
      id: "filter-none",
      logicalName: "none",
      displayName: "None",
      secondaryLogicalName: null,
      secondaryDisplayName: null,
    };

    expect(entityDisplayName(option)).toBe("None");
    expect(entityLogicalName(option)).toBe("none");
  });
});

describe("entity picker options", () => {
  it("omits unbound none filters when the message has real tables", () => {
    const options = buildEntityPickerOptions([
      { id: "none-1", primaryTable: "none", secondaryTable: "none" },
      { id: "none-2", primaryTable: "None", secondaryTable: null },
      { id: "none-3", primaryTable: "none", secondaryTable: "none" },
      { id: "account", primaryTable: "account", secondaryTable: "none" },
      { id: "contact", primaryTable: "contact", secondaryTable: null },
    ], entities);

    expect(options.map((option) => option.logicalName)).toEqual(["account", "contact"]);
    expect(options.some((option) => option.displayName === "None")).toBe(false);
  });

  it("shows a single None only when every filter is unbound", () => {
    const options = buildEntityPickerOptions([
      { id: "none-1", primaryTable: "none", secondaryTable: "none" },
      { id: "none-2", primaryTable: "None", secondaryTable: null },
      { id: "none-3", primaryTable: "none", secondaryTable: "none" },
    ], entities);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ id: "none-1", displayName: "None", logicalName: "none" });
  });

  it("uses the related table when the primary table is none", () => {
    const option = toEntityOption("filter-associate", "none", "account", entities);
    expect(entityDisplayName(option)).toBe("Account");
    expect(entityLogicalName(option)).toBe("account");
  });

  it("keeps the current None filter when it is already registered", () => {
    const current = toEntityOption("current-none", "none", "none", entities, true);
    const options = buildEntityPickerOptions(
      [{ id: "account", primaryTable: "account", secondaryTable: null }],
      entities,
      current,
    );
    expect(options.map((option) => option.id)).toEqual(["account", "current-none"]);
    expect(options.find((option) => option.id === "current-none")?.unavailable).toBe(true);
  });
});
