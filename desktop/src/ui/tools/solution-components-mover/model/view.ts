import type { SolutionRow, SortColumn, SortDirection, SortState } from "./types";

export const defaultSort: SortState = { column: "friendlyName", direction: "asc" };

export function managedLabel(isManaged: boolean): string {
  return isManaged ? "Managed" : "Unmanaged";
}

export function solutionLabel(solution: SolutionRow): string {
  return solution.friendlyName || solution.uniqueName || solution.id;
}

export function filterSolutions(rows: readonly SolutionRow[], filter: string): SolutionRow[] {
  const needle = filter.trim().toLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) => displayedValues(row).some((value) => value.toLowerCase().includes(needle)));
}

export function sortSolutions(
  rows: readonly SolutionRow[],
  column: SortColumn,
  direction: SortDirection,
): SolutionRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => factor * compareSolutions(left, right, column));
}

export function toggleSort(current: SortState, column: SortColumn): SortState {
  if (current.column !== column) return { column, direction: "asc" };
  return { column, direction: current.direction === "asc" ? "desc" : "asc" };
}

export function solutionEditorUrl(envUrl: string, solutionId: string): string {
  const base = envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
  return `${base}/tools/solution/edit.aspx?id=${solutionId}`;
}

export function exportLogText(environmentName: string | null, rows: readonly { label: string; solutionUniqueName: string; succeeded: boolean; message: string }[]): string {
  const lines = [
    `Environment: ${environmentName ?? ""}`,
    "Component\tTarget solution\tResult\tDetail",
    ...rows.map((row) =>
      [row.label, row.solutionUniqueName, row.succeeded ? "Succeeded" : "Failed", row.succeeded ? "" : row.message].join("\t")),
  ];
  return lines.join("\n");
}

function displayedValues(row: SolutionRow): string[] {
  return [
    row.friendlyName,
    row.uniqueName,
    row.publisherName ?? "",
    row.installedOn ?? "",
    row.version,
    managedLabel(row.isManaged),
  ];
}

function compareSolutions(left: SolutionRow, right: SolutionRow, column: SortColumn): number {
  if (column === "installedOn") return compareInstalled(left.installedOn, right.installedOn);
  return textValue(left, column).localeCompare(textValue(right, column), undefined, { sensitivity: "base" });
}

function compareInstalled(left: string | null, right: string | null): number {
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;
  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return leftTime - rightTime;
  return (left ?? "").localeCompare(right ?? "", undefined, { sensitivity: "base" });
}

function textValue(row: SolutionRow, column: SortColumn): string {
  switch (column) {
    case "friendlyName":
      return row.friendlyName;
    case "uniqueName":
      return row.uniqueName;
    case "publisherName":
      return row.publisherName ?? "";
    case "version":
      return row.version;
    case "isManaged":
      return managedLabel(row.isManaged);
    default:
      return row.installedOn ?? "";
  }
}
