import type { AttributeInfo } from "./types";

const byTypeName: Record<string, string> = {
  MultiSelectPicklistType: "Choices",
  ImageType: "Image",
  FileType: "File",
};

const byType: Record<string, string> = {
  String: "Single line of text",
  Memo: "Multiple lines of text",
  Integer: "Whole number",
  BigInt: "Big integer",
  Decimal: "Decimal",
  Double: "Float",
  Money: "Currency",
  DateTime: "Date and time",
  Boolean: "Yes/No",
  Picklist: "Choice",
  Lookup: "Lookup",
  Customer: "Customer",
  Owner: "Owner",
  PartyList: "Party list",
  State: "Status",
  Status: "Status reason",
  Uniqueidentifier: "Unique identifier",
  EntityName: "Entity name",
  Virtual: "Virtual",
};

const lookupLike = new Set(["Lookup", "Customer", "Owner", "PartyList"]);

type TypeFields = Pick<AttributeInfo, "attributeType" | "attributeTypeName">;

/** Friendly type label. Unknown values show the raw name. */
export function attributeTypeLabel(attribute: TypeFields): string {
  const named = attribute.attributeTypeName ? byTypeName[attribute.attributeTypeName] : undefined;
  if (named) return named;
  return byType[attribute.attributeType] ?? attribute.attributeType;
}

/** The raw type name, for the details modal. */
export function rawTypeName(attribute: TypeFields): string {
  return attribute.attributeTypeName?.trim() ? attribute.attributeTypeName : attribute.attributeType;
}

export function isLookupLike(attribute: Pick<AttributeInfo, "attributeType">): boolean {
  return lookupLike.has(attribute.attributeType);
}

/** Related tables comma-joined, or an empty string for fields that do not point at a table. */
export function relatedTablesText(attribute: Pick<AttributeInfo, "attributeType" | "targets">): string {
  if (!isLookupLike(attribute)) return "";
  return (attribute.targets ?? []).join(", ");
}
