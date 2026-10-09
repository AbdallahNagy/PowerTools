import { isDescription, labelName, labelOrder } from "./labels";
import type { LabelRow, TableInfo } from "./types";

export type ShowFilter = "both" | "names" | "descriptions";

export interface SortState {
  /** null means the default order: component, value, then label. */
  key: string | null;
  direction: "asc" | "desc";
}

export const DEFAULT_SORT: SortState = { key: null, direction: "asc" };

/** The header that shows the sort arrow. The default order sorts by Component first. */
export function effectiveSortKey(sort: SortState): string {
  return sort.key ?? "component";
}

export function langSortKey(lcid: number): string {
  return `lang:${lcid}`;
}

/** First click sorts ascending; clicking the same header again sorts descending. */
export function nextSort(current: SortState, key: string): SortState {
  if (effectiveSortKey(current) === key) return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  return { key, direction: "asc" };
}

export function filterByShow(rows: readonly LabelRow[], show: ShowFilter): LabelRow[] {
  if (show === "both") return [...rows];
  return rows.filter((row) => (show === "descriptions") === isDescription(row.key.property));
}

/** Matches the component's names and every visible language value. */
export function filterByQuery(rows: readonly LabelRow[], query: string, lcids: readonly number[]): LabelRow[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) => {
    if (row.component.toLocaleLowerCase().includes(needle)) return true;
    if (row.componentName?.toLocaleLowerCase().includes(needle)) return true;
    return lcids.some((lcid) => (row.labels[String(lcid)] ?? "").toLocaleLowerCase().includes(needle));
  });
}

const compareText = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });

function compareValue(left: number | null | undefined, right: number | null | undefined): number {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  return left - right;
}

function defaultCompare(left: LabelRow, right: LabelRow): number {
  return (
    compareText(left.component, right.component) ||
    compareText(left.componentName ?? "", right.componentName ?? "") ||
    compareValue(left.key.value, right.key.value) ||
    labelOrder(left) - labelOrder(right) ||
    (left.key.side ?? 0) - (right.key.side ?? 0)
  );
}

/** Sorts on loaded values, never drafts, so rows do not move while the user types. */
export function sortRows(rows: readonly LabelRow[], sort: SortState): LabelRow[] {
  const sorted = [...rows];
  const key = sort.key;
  if (!key) return sorted.sort(defaultCompare);

  const direction = sort.direction === "desc" ? -1 : 1;
  const compare = (left: LabelRow, right: LabelRow): number => {
    if (key === "component") return compareText(left.component, right.component);
    if (key === "value") return compareValue(left.key.value, right.key.value);
    if (key === "type") return compareText(left.detail ?? "", right.detail ?? "");
    if (key === "label") return labelOrder(left) - labelOrder(right) || compareText(labelName(left), labelName(right));
    if (key.startsWith("lang:")) {
      const lcid = key.slice("lang:".length);
      return compareText(left.labels[lcid] ?? "", right.labels[lcid] ?? "");
    }
    return 0;
  };
  return sorted.sort((left, right) => compare(left, right) * direction || defaultCompare(left, right));
}

/** Number of distinct components, for the status bar. */
export function componentCount(rows: readonly LabelRow[]): number {
  return new Set(
    rows.map((row) =>
      [row.key.table, row.key.column, row.key.optionSet, row.key.recordId, row.key.relationship, row.key.side].join("|"),
    ),
  ).size;
}

export function filterTables(tables: readonly TableInfo[], query: string): TableInfo[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...tables];
  return tables.filter(
    (table) =>
      table.logicalName.toLocaleLowerCase().includes(needle) ||
      (table.displayName ?? "").toLocaleLowerCase().includes(needle),
  );
}
