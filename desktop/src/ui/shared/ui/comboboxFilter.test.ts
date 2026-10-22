import { describe, expect, it } from "vitest";

import { comboboxOptionText, filterComboboxOptions, type ComboboxOption } from "./comboboxFilter";

const tables: ComboboxOption[] = [
  { value: "account", label: "Account", description: "account" },
  { value: "contact", label: "Contact", description: "contact" },
  { value: "new_accountsegment", label: "Account Segment", description: "new_accountsegment" },
  { value: "msdyn_customerasset", label: "Customer Asset", description: "msdyn_customerasset" },
  { value: "systemuser", label: "User", description: "systemuser" },
];

const labels = (options: ComboboxOption[]) => options.map((option) => option.label);

describe("filterComboboxOptions", () => {
  it("keeps every option for a blank query", () => {
    expect(filterComboboxOptions(tables, "  ")).toBe(tables);
  });

  it("matches anywhere in the label, description, or value, ignoring case", () => {
    expect(labels(filterComboboxOptions(tables, "SEG"))).toEqual(["Account Segment"]);
    expect(labels(filterComboboxOptions(tables, "systemuser"))).toEqual(["User"]);
    expect(labels(filterComboboxOptions(tables, "msdyn"))).toEqual(["Customer Asset"]);
  });

  it("requires every typed word, in any order", () => {
    expect(labels(filterComboboxOptions(tables, "segment acc"))).toEqual(["Account Segment"]);
    expect(labels(filterComboboxOptions(tables, "account contact"))).toEqual([]);
  });

  it("ranks exact and prefix matches before matches inside a word", () => {
    const options: ComboboxOption[] = [
      { value: "parentaccountid", label: "Parent Account" },
      { value: "accountnumber", label: "Account Number" },
      { value: "account", label: "Account" },
      { value: "subaccounts", label: "Subaccounts" },
    ];
    expect(labels(filterComboboxOptions(options, "account"))).toEqual([
      "Account",
      "Account Number",
      "Parent Account",
      "Subaccounts",
    ]);
  });

  it("ignores accents", () => {
    expect(labels(filterComboboxOptions([{ value: "1", label: "Société" }], "societe"))).toEqual(["Société"]);
  });

  it("keeps group order and ranks within each group", () => {
    const options: ComboboxOption[] = [
      { value: "field:primarycontactid", label: "Primary Contact", group: "Fields" },
      { value: "field:contact", label: "Contact", group: "Fields" },
      { value: "relationship:0", label: "Primary Contact > Contact", group: "Related tables" },
    ];
    expect(filterComboboxOptions(options, "contact").map((option) => option.value)).toEqual([
      "field:contact",
      "field:primarycontactid",
      "relationship:0",
    ]);
  });
});

describe("comboboxOptionText", () => {
  it("adds the description in parentheses", () => {
    expect(comboboxOptionText(tables[0]!)).toBe("Account (account)");
    expect(comboboxOptionText({ value: "x", label: "Create" })).toBe("Create");
  });
});
