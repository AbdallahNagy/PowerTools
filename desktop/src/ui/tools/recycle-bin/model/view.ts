import type { FieldRow } from "./fields";
import type { DeletedRecord, RestoreEntry } from "./types";

export type SortDirection = "asc" | "desc";

export interface SortState<Key extends string> {
  key: Key;
  direction: SortDirection;
}

export type RecordSortKey = "name" | "deletedOn" | "deletedBy";
export type FieldSortKey = "displayName" | "logicalName";

/** First click ascending, the same header again descending. */
export function nextSort<Key extends string>(current: SortState<Key>, key: Key): SortState<Key> {
  if (current.key !== key) return { key, direction: "asc" };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function compareText(a: string | null, b: string | null): number {
  return collator.compare(a ?? "", b ?? "");
}

export function sortRecords(rows: DeletedRecord[], sort: SortState<RecordSortKey>): DeletedRecord[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const result =
      sort.key === "deletedOn"
        ? (a.deletedOn ?? "").localeCompare(b.deletedOn ?? "")
        : compareText(a[sort.key], b[sort.key]);
    return result * factor;
  });
}

export function sortFields(rows: FieldRow[], sort: SortState<FieldSortKey>): FieldRow[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => compareText(a[sort.key], b[sort.key]) * factor);
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function displayName(row: DeletedRecord): string {
  return row.name?.trim() || "(No name)";
}

export function restoreSummary(entries: RestoreEntry[]): { restored: number; failed: number; skipped: number } {
  return {
    restored: entries.filter((entry) => entry.status === "restored").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    skipped: entries.filter((entry) => entry.status === "skipped").length,
  };
}
