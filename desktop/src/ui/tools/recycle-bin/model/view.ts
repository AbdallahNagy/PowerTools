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

export interface RestoreSummary {
  restored: number;
  failed: number;
  skipped: number;
  alreadyRestored: number;
}

export function restoreSummary(entries: RestoreEntry[]): RestoreSummary {
  const count = (status: RestoreEntry["status"]) => entries.filter((entry) => entry.status === status).length;
  return {
    restored: count("restored"),
    failed: count("failed"),
    skipped: count("skipped"),
    alreadyRestored: count("alreadyRestored"),
  };
}

/** "{r} restored, {f} failed", plus already restored and skipped counts when there are any. */
export function summaryText(summary: RestoreSummary): string {
  const parts = [`${summary.restored} restored`, `${summary.failed} failed`];
  if (summary.alreadyRestored > 0) parts.push(`${summary.alreadyRestored} already restored`);
  if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`);
  return parts.join(", ");
}
