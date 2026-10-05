import type { SortDirection, SortState, ViewRow, WorkflowRow } from "./types";

export type WorkflowSortKey = "name" | "entity" | "mode";
export type ViewSortKey = "name" | "type";
export type ErrorSortKey = "recordId" | "message";

export const defaultWorkflowSort: SortState<WorkflowSortKey> = { key: "name", direction: "asc" };
export const defaultViewSort: SortState<ViewSortKey> = { key: "type", direction: "asc" };

export function nextSort<Key extends string>(current: SortState<Key> | null, key: Key): SortState<Key> {
  if (current?.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: "asc" };
}

export function modeLabel(mode: WorkflowRow["mode"]): string {
  return mode === "realtime" ? "Real-time" : "Background";
}

export function viewKindLabel(kind: ViewRow["kind"]): string {
  return kind === "personal" ? "Personal" : "System";
}

export function entityLabel(logicalName: string, displayNames: ReadonlyMap<string, string>): string {
  return displayNames.get(logicalName) ?? logicalName;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function directed(result: number, direction: SortDirection): number {
  return direction === "asc" ? result : -result;
}

export function filterWorkflows(
  rows: readonly WorkflowRow[],
  filter: string,
  displayNames: ReadonlyMap<string, string>,
): WorkflowRow[] {
  const needle = filter.trim().toLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) =>
    [row.name, row.primaryEntity, entityLabel(row.primaryEntity, displayNames)].some((value) =>
      value.toLowerCase().includes(needle),
    ),
  );
}

export function sortWorkflows(
  rows: readonly WorkflowRow[],
  sort: SortState<WorkflowSortKey>,
  displayNames: ReadonlyMap<string, string>,
): WorkflowRow[] {
  const value = (row: WorkflowRow) =>
    sort.key === "entity"
      ? entityLabel(row.primaryEntity, displayNames)
      : sort.key === "mode"
        ? modeLabel(row.mode)
        : row.name;
  return [...rows].sort(
    (a, b) => directed(compareText(value(a), value(b)), sort.direction) || compareText(a.name, b.name),
  );
}

export function filterViews(rows: readonly ViewRow[], filter: string): ViewRow[] {
  const needle = filter.trim().toLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) => row.name.toLowerCase().includes(needle));
}

function kindRank(kind: ViewRow["kind"]): number {
  return kind === "system" ? 0 : 1;
}

/** Default order is system views first, then personal, each by name. */
export function sortViews(rows: readonly ViewRow[], sort: SortState<ViewSortKey>): ViewRow[] {
  return [...rows].sort((a, b) => {
    if (sort.key === "type") {
      const byType = directed(kindRank(a.kind) - kindRank(b.kind), sort.direction);
      return byType || compareText(a.name, b.name);
    }
    return directed(compareText(a.name, b.name), sort.direction);
  });
}

export function sortErrors<Row extends { recordId: string; message: string }>(
  rows: readonly Row[],
  sort: SortState<ErrorSortKey> | null,
): Row[] {
  if (!sort) return [...rows];
  return [...rows].sort((a, b) => directed(compareText(a[sort.key], b[sort.key]), sort.direction));
}
