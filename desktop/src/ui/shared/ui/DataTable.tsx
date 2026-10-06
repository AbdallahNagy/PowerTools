import type { ReactNode } from "react";

interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  width?: string;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  getRowKey: (row: T) => string;
  selectedKey?: string | null;
  emptyMessage?: string;
  sortKey?: string | null;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string) => void;
}

export function DataTable<T>({
  columns,
  rows,
  onRowClick,
  onRowDoubleClick,
  getRowKey,
  selectedKey,
  emptyMessage = "No results.",
  sortKey,
  sortDirection = "asc",
  onSort,
}: DataTableProps<T>) {
  return (
    <div className="w-full overflow-auto rounded-sm border border-line">
      <table className="w-full text-sm text-fg border-collapse">
        <thead className="bg-surface sticky top-0 z-10">
          <tr>
            {columns.map((col) => {
              const sortable = col.sortable === true && onSort != null;
              const sorted = sortable && sortKey === col.key;
              const ariaSort = sorted
                ? (sortDirection === "asc" ? "ascending" : "descending")
                : (sortable ? "none" : undefined);
              return (
                <th
                  key={col.key}
                  aria-sort={ariaSort}
                  className="text-left px-3 py-2 font-medium text-fg-muted text-xs tracking-wider border-b border-line"
                  style={col.width ? { width: col.width } : undefined}
                >
                  {sortable ? (
                    <button
                      type="button"
                      className="w-full text-left font-medium"
                      onClick={() => onSort(col.key)}
                    >
                      {col.header}
                      {sorted ? (
                        <span className="ml-1" aria-hidden="true">
                          {sortDirection === "desc" ? "↓" : "↑"}
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-6 text-center text-fg-muted text-xs"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const key = getRowKey(row);
              const selected = selectedKey != null && selectedKey === key;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
                  aria-selected={selectedKey != null ? selected : undefined}
                  className={`border-b border-line last:border-0 transition-colors ${
                    selected ? "bg-accent-soft" : ""
                  } ${onRowClick || onRowDoubleClick ? "cursor-pointer hover:bg-hover" : ""}`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2">
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
