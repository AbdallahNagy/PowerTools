import { attributeTypeLabel, relatedTablesText } from "./attributeType";
import { requiredLevelRank } from "./requiredLevel";
import { displayLabel } from "./search";
import type { AttributeInfo } from "./types";

export type SortKey = "displayName" | "logicalName" | "type" | "relatedTable" | "required";
export type SortDirection = "asc" | "desc";

export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

export const DEFAULT_SORT: SortState = { key: "displayName", direction: "asc" };

export function isSortKey(value: string): value is SortKey {
  return (
    value === "displayName" ||
    value === "logicalName" ||
    value === "type" ||
    value === "relatedTable" ||
    value === "required"
  );
}

/** Clicking the active column flips the direction. Another column starts ascending. */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: "asc" };
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function compareText(a: string, b: string): number {
  return collator.compare(a, b);
}

function compareByKey(a: AttributeInfo, b: AttributeInfo, key: SortKey): number {
  switch (key) {
    case "displayName":
      return compareText(displayLabel(a), displayLabel(b));
    case "logicalName":
      return compareText(a.logicalName, b.logicalName);
    case "type":
      return compareText(attributeTypeLabel(a), attributeTypeLabel(b));
    case "relatedTable":
      return compareText(relatedTablesText(a), relatedTablesText(b));
    case "required":
      return requiredLevelRank(a.requiredLevel) - requiredLevelRank(b.requiredLevel);
  }
}

export function sortAttributes(
  attributes: readonly AttributeInfo[],
  sort: SortState = DEFAULT_SORT,
): AttributeInfo[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...attributes].sort((a, b) => {
    const primary = compareByKey(a, b, sort.key) * factor;
    if (primary !== 0) return primary;
    return compareText(a.logicalName, b.logicalName);
  });
}
