import type { AttributeInfo, TableInfo } from "./types";

interface Named {
  logicalName: string;
  displayName: string | null;
}

/** The display name, or the logical name when the label is missing. */
export function displayLabel(item: Named): string {
  return item.displayName?.trim() ? item.displayName : item.logicalName;
}

function filterNamed<T extends Named>(items: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...items];
  return items.filter(
    (item) =>
      (item.displayName ?? "").toLowerCase().includes(needle) ||
      item.logicalName.toLowerCase().includes(needle),
  );
}

export function filterTables(tables: readonly TableInfo[], query: string): TableInfo[] {
  return filterNamed(tables, query);
}

export function filterAttributes(
  attributes: readonly AttributeInfo[],
  query: string,
): AttributeInfo[] {
  return filterNamed(attributes, query);
}

/** `812` while unfiltered, `24 of 812` while filtering. */
export function tablesCountLabel(shown: number, total: number): string {
  return shown === total ? String(total) : `${shown} of ${total}`;
}

/** `143 fields` while unfiltered, `12 of 143` while filtering. */
export function fieldsCountLabel(shown: number, total: number): string {
  if (shown !== total) return `${shown} of ${total}`;
  return total === 1 ? "1 field" : `${total} fields`;
}
