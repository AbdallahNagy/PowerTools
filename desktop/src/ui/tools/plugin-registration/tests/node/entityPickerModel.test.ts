import { describe, expect, it } from "vitest";

import {
  entityDisplayName,
  entityLogicalName,
  entityOptionLabel,
  entitySearchText,
  isPresentTable,
} from "../../components/entityPickerModel";

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
});
