import type { TableSummary } from "./types";

export const DEFAULT_NAMESPACE = "Dataverse.Model";

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Dotted C# namespace such as Contoso.Model. Keywords are checked by the sidecar. */
export function isValidNamespace(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return trimmed.split(".").every((part) => identifier.test(part));
}

/** Matches display name, logical name, or schema name, ignoring case. */
export function filterTables(tables: readonly TableSummary[], query: string): TableSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...tables];
  return tables.filter(
    (table) =>
      table.displayName.toLowerCase().includes(needle) ||
      table.logicalName.toLowerCase().includes(needle) ||
      table.schemaName.toLowerCase().includes(needle),
  );
}

/** Adds or removes every given table, keeping the rest of the selection. */
export function setSelection(
  current: ReadonlySet<string>,
  logicalNames: readonly string[],
  selected: boolean,
): Set<string> {
  const next = new Set(current);
  for (const name of logicalNames) {
    if (selected) next.add(name);
    else next.delete(name);
  }
  return next;
}
