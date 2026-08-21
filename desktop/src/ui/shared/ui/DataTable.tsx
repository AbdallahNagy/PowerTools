import type { ReactNode } from "react";

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  getRowKey: (row: T) => string;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  rows,
  onRowClick,
  getRowKey,
  emptyMessage = "No results.",
}: DataTableProps<T>) {
  return (
    <div className="w-full overflow-auto rounded-sm border border-[#3c3c3c]">
      <table className="w-full text-sm text-[#cccccc] border-collapse">
        <thead className="bg-[#252526] sticky top-0 z-10">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left px-3 py-2 font-medium text-[#858585] text-xs uppercase tracking-wider border-b border-[#3c3c3c]"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-6 text-center text-[#858585] text-xs"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={getRowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-[#3c3c3c] last:border-0 transition-colors ${
                  onRowClick ? "cursor-pointer hover:bg-[#2a2d2e]" : ""
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2">
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
