import { formatDateTime } from "./dates";
import type { AttributeInfo, FieldValue } from "./types";

export interface FieldRow {
  logicalName: string;
  displayName: string;
  value: string;
  raw: string;
}

function optionLabel(attribute: AttributeInfo | undefined, value: string): string | null {
  const option = attribute?.optionSet?.find((item) => String(item.value) === value);
  return option?.label ?? null;
}

/** The Value column: lookup as the related record's name, choice as its label, local dates, Yes or No. */
export function formatField(field: FieldValue, attribute: AttributeInfo | undefined): string {
  const value = field.value ?? "";
  switch (field.kind) {
    case "lookup":
      return field.formatted || (field.lookupTable ? `${field.lookupTable} ${value}` : value);
    case "choice":
      return optionLabel(attribute, value) ?? field.formatted ?? value;
    case "multichoice":
      return value
        ? value.split(",").map((item) => optionLabel(attribute, item) ?? item).join("; ")
        : (field.formatted ?? "");
    case "boolean":
      return value === "true" ? "Yes" : value === "false" ? "No" : value;
    case "datetime":
      return formatDateTime(value);
    default:
      return field.formatted ?? value;
  }
}

export function fieldRows(fields: FieldValue[], attributes: AttributeInfo[] | undefined): FieldRow[] {
  const byName = new Map((attributes ?? []).map((attribute) => [attribute.logicalName, attribute]));
  return fields.map((field) => {
    const attribute = byName.get(field.logicalName);
    return {
      logicalName: field.logicalName,
      displayName: attribute?.displayName || field.logicalName,
      value: formatField(field, attribute),
      raw: field.lookupTable ? `${field.lookupTable}:${field.value ?? ""}` : (field.value ?? ""),
    };
  });
}

/** Matches display name, logical name and value text. */
export function filterFields(rows: FieldRow[], search: string): FieldRow[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    [row.displayName, row.logicalName, row.value].some((text) => text.toLowerCase().includes(needle)));
}
