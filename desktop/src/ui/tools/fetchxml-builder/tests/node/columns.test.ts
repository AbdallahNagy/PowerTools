import { expect, test } from "vitest";
import { applyColumnSelection, knownColumns, orderResultColumns } from "../../model/columns.ts";
import type { FieldMetadata } from "../../model/types.ts";

function field(logicalName: string): FieldMetadata {
  return {
    logicalName,
    displayName: logicalName,
    attributeType: "String",
    isPrimaryId: false,
    isCustomAttribute: false,
    isInDefaultView: false,
    requiredLevel: "None",
    isValidForCreate: true,
    isValidForUpdate: true,
  };
}

test("keeps only known columns in view order without duplicates", () => {
  const fields = [field("name"), field("telephone1"), field("description")];
  expect(knownColumns(["telephone1", "removedcolumn", "name", "telephone1"], fields)).toEqual([
    "telephone1",
    "name",
  ]);
});

test("puts requested columns first, then other returned columns", () => {
  expect(orderResultColumns(["name", "description"], ["accountid", "name"])).toEqual([
    "name",
    "description",
    "accountid",
  ]);
});

test("keeps existing column order and appends newly checked columns", () => {
  expect(applyColumnSelection(["name", "telephone1", "emailaddress1"], ["emailaddress1", "description", "name"]))
    .toEqual(["name", "emailaddress1", "description"]);
});
