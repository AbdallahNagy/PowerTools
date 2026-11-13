/** What the host's `metadata.tables()` returns for each table. */
export interface TableInfo {
  logicalName: string;
  /** `null` for tables without a label, such as many relationship tables. */
  displayName: string | null;
  entitySetName: string;
  primaryIdAttribute: string;
  primaryNameAttribute: string;
  isCustom: boolean;
}

/** What the host's `metadata.columns(table)` returns for each column. */
export interface ColumnInfo {
  logicalName: string;
  displayName: string | null;
  type: string;
  isCustom: boolean;
  requiredLevel: string;
  targets: string[];
}

/** The display name, or the logical name when the label is empty. */
export function label(item: { logicalName: string; displayName: string | null }): string {
  return item.displayName?.trim() ? item.displayName : item.logicalName;
}

export function matches(item: { logicalName: string; displayName: string | null }, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || item.logicalName.toLowerCase().includes(needle) || (item.displayName ?? "").toLowerCase().includes(needle);
}

const REQUIRED_LABELS: Record<string, string> = {
  None: "Optional",
  SystemRequired: "System required",
  ApplicationRequired: "Required",
  Recommended: "Recommended",
};

export function requiredLabel(level: string): string {
  return REQUIRED_LABELS[level] ?? level;
}
