import { describe, expect, it } from "vitest";

import {
  attributeTypeLabel,
  isLookupLike,
  rawTypeName,
  relatedTablesText,
} from "../../model/attributeType";

const label = (attributeType: string, attributeTypeName: string | null = null) =>
  attributeTypeLabel({ attributeType, attributeTypeName });

describe("attribute type label", () => {
  it.each([
    ["String", "Single line of text"],
    ["Memo", "Multiple lines of text"],
    ["Integer", "Whole number"],
    ["BigInt", "Big integer"],
    ["Decimal", "Decimal"],
    ["Double", "Float"],
    ["Money", "Currency"],
    ["DateTime", "Date and time"],
    ["Boolean", "Yes/No"],
    ["Picklist", "Choice"],
    ["Lookup", "Lookup"],
    ["Customer", "Customer"],
    ["Owner", "Owner"],
    ["PartyList", "Party list"],
    ["State", "Status"],
    ["Status", "Status reason"],
    ["Uniqueidentifier", "Unique identifier"],
    ["EntityName", "Entity name"],
    ["Virtual", "Virtual"],
  ])("maps %s to %s", (type, expected) => {
    expect(label(type)).toBe(expected);
  });

  it("uses the type name to tell virtual columns apart", () => {
    expect(label("Virtual", "MultiSelectPicklistType")).toBe("Choices");
    expect(label("Virtual", "ImageType")).toBe("Image");
    expect(label("Virtual", "FileType")).toBe("File");
    expect(label("Virtual", "SomethingElse")).toBe("Virtual");
  });

  it("shows the raw name for an unknown type", () => {
    expect(label("ManagedProperty")).toBe("ManagedProperty");
  });

  it("reports the raw type name", () => {
    expect(rawTypeName({ attributeType: "Virtual", attributeTypeName: "ImageType" })).toBe(
      "ImageType",
    );
    expect(rawTypeName({ attributeType: "String", attributeTypeName: null })).toBe("String");
  });

  it("joins targets for lookup-like types only", () => {
    expect(isLookupLike({ attributeType: "Customer" })).toBe(true);
    expect(isLookupLike({ attributeType: "String" })).toBe(false);
    expect(relatedTablesText({ attributeType: "Customer", targets: ["account", "contact"] })).toBe(
      "account, contact",
    );
    expect(relatedTablesText({ attributeType: "Lookup", targets: null })).toBe("");
    expect(relatedTablesText({ attributeType: "String", targets: ["account"] })).toBe("");
  });
});
