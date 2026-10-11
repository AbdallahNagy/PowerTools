import type { DeletedRecord, RestoreItem, Source } from "./types";

/** Records per restore request. The sidecar accepts at most 100. */
export const RESTORE_CHUNK_SIZE = 25;

/**
 * Keeps only the most recent deletion of each record id. Returns how many older deletions were left out.
 */
export function latestDeletions(rows: DeletedRecord[]): { rows: DeletedRecord[]; dropped: number } {
  const latest = new Map<string, DeletedRecord>();
  for (const row of rows) {
    const id = `${row.table}:${row.recordId.toLowerCase()}`;
    const current = latest.get(id);
    if (!current || (row.deletedOn ?? "") > (current.deletedOn ?? "")) latest.set(id, row);
  }
  const kept = rows.filter((row) => latest.get(`${row.table}:${row.recordId.toLowerCase()}`) === row);
  return { rows: kept, dropped: rows.length - kept.length };
}

/** How many record ids were checked more than once. */
export function repeatedRecordCount(rows: DeletedRecord[]): number {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const id = `${row.table}:${row.recordId.toLowerCase()}`;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

/**
 * Audit log: oldest deletion first, so parents removed before their children come back first.
 * Recycle bin: the order the user sees.
 */
export function orderForRestore(source: Source, rows: DeletedRecord[]): DeletedRecord[] {
  if (source === "bin") return [...rows];
  return [...rows].sort((a, b) => (a.deletedOn ?? "").localeCompare(b.deletedOn ?? ""));
}

export function chunk<T>(items: T[], size: number = RESTORE_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export function toRestoreItem(row: DeletedRecord): RestoreItem {
  return { table: row.table, recordId: row.recordId, auditId: row.auditId };
}
