import type { FieldMetadata } from "./types.ts";

/** Keeps only columns the table has, in the given order, without duplicates. */
export function knownColumns(columns: string[], fields: FieldMetadata[]): string[] {
  const names = new Set(fields.map((field) => field.logicalName));
  return [...new Set(columns)].filter((column) => names.has(column));
}

/**
 * Grid column order: the requested columns first, in the order the user chose,
 * then any other column the query returned, such as the primary key.
 */
export function orderResultColumns(requested: string[], returned: string[]): string[] {
  const requestedSet = new Set(requested);
  return [...requested, ...returned.filter((column) => !requestedSet.has(column))];
}

/**
 * Applies a checkbox selection to the current columns: columns kept stay in place
 * and newly checked columns go to the end in the order they were checked.
 */
export function applyColumnSelection(current: string[], checked: string[]): string[] {
  const checkedSet = new Set(checked);
  const kept = current.filter((column) => checkedSet.has(column));
  const keptSet = new Set(kept);
  return [...kept, ...checked.filter((column) => !keptSet.has(column))];
}
