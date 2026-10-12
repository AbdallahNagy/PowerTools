import type { GeneratedFile } from "./types";

export type FileSortKey = "path" | "kind" | "name";

export interface FileSort {
  key: FileSortKey;
  direction: "asc" | "desc";
}

export const DEFAULT_FILE_SORT: FileSort = { key: "path", direction: "asc" };

/** First click on a header sorts ascending, the second descending. */
export function nextFileSort(current: FileSort, key: FileSortKey): FileSort {
  if (current.key !== key) return { key, direction: "asc" };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

export function filterFiles(files: readonly GeneratedFile[], query: string): GeneratedFile[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...files];
  return files.filter(
    (file) => file.path.toLowerCase().includes(needle) || file.name.toLowerCase().includes(needle),
  );
}

export function sortFiles(files: readonly GeneratedFile[], sort: FileSort): GeneratedFile[] {
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...files].sort((left, right) => {
    const primary = left[sort.key].localeCompare(right[sort.key], undefined, { sensitivity: "base" });
    if (primary !== 0) return primary * factor;
    return left.path.localeCompare(right.path, undefined, { sensitivity: "base" });
  });
}

/** True when the run wrote no table, choice, or message class. */
export function matchedNothing(files: readonly GeneratedFile[]): boolean {
  return !files.some((file) => file.kind === "Table" || file.kind === "Choice" || file.kind === "Message");
}

/** "8 s", "1 min 12 s", "3 min". */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
