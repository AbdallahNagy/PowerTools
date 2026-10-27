import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "./cn";
import { ColumnResizeHandle } from "./ColumnResizeHandle";
import { useColumnResize } from "./useColumnResize";

/** Above this many rows, only the rows in view are rendered. */
export const VIRTUALIZE_AFTER = 100;
const ESTIMATED_ROW_HEIGHT = 37;

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
  getRowKey: (row: T, index: number) => string;
  selectedKey?: string | null;
  emptyMessage?: string;
  sortKey?: string | null;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string) => void;
  className?: string;
  /** Lets the user drag header edges to resize columns. On by default. */
  resizable?: boolean;
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
  className,
  resizable = true,
}: DataTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const resize = useColumnResize(columns.map((col) => col.key));
  const virtualize = rows.length > VIRTUALIZE_AFTER;
  const virtualizer = useVirtualizer({
    count: virtualize ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 12,
  });

  const items = virtualize ? virtualizer.getVirtualItems() : null;
  const visible = items
    ? items.map((item) => ({ row: rows[item.index]!, index: item.index }))
    : rows.map((row, index) => ({ row, index }));
  const padTop = items && items.length > 0 ? items[0]!.start : 0;
  const padBottom =
    items && items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1]!.end : 0;

  return (
    // max-h-full lets the table scroll inside a sized parent, so rows can be virtualized
    // and the header stays visible. With a few rows it is only as tall as its content.
    <div
      ref={scrollRef}
      className={cn("w-full max-h-full overflow-auto rounded-sm border border-line", className)}
    >
      <table
        ref={resize.tableRef}
        className="w-full text-sm text-fg border-collapse"
        style={resize.tableStyle}
        aria-rowcount={virtualize ? rows.length + 1 : undefined}
      >
        <thead className="bg-surface sticky top-0 z-10">
          <tr>
            {columns.map((col) => {
              const sortable = col.sortable === true && onSort != null;
              const sorted = sortable && sortKey === col.key;
              const header = resize.headerProps(col.key);
              const width = header.style?.width ?? col.width;
              const ariaSort = sorted
                ? (sortDirection === "asc" ? "ascending" : "descending")
                : (sortable ? "none" : undefined);
              return (
                <th
                  key={col.key}
                  data-column-key={header["data-column-key"]}
                  aria-sort={ariaSort}
                  className="relative text-left px-3 py-2 font-medium text-fg-muted text-xs tracking-wider border-b border-line"
                  style={width != null ? { width } : undefined}
                >
                  {sortable ? (
                    <button
                      type="button"
                      className="w-full text-left font-medium"
                      onClick={() => onSort(col.key)}
                    >
                      {col.header}
                      {sorted ? (
                        <span className="ml-1 inline-flex align-middle" aria-hidden="true">
                          {sortDirection === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    col.header
                  )}
                  {resizable ? (
                    <ColumnResizeHandle resize={resize} columnKey={col.key} />
                  ) : null}
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
            <>
              {padTop > 0 ? <SpacerRow height={padTop} columns={columns.length} /> : null}
              {visible.map(({ row, index }) => {
                const key = getRowKey(row, index);
                const selected = selectedKey != null && selectedKey === key;
                return (
                  <tr
                    key={key}
                    data-index={index}
                    ref={virtualize ? virtualizer.measureElement : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
                    aria-selected={selectedKey != null ? selected : undefined}
                    aria-rowindex={virtualize ? index + 2 : undefined}
                    className={`border-b border-line last:border-0 transition-colors ${
                      selected ? "bg-accent-soft" : ""
                    } ${onRowClick || onRowDoubleClick ? "cursor-pointer hover:bg-hover" : ""}`}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn("px-3 py-2", resize.resized && "overflow-hidden text-ellipsis")}
                      >
                        {col.render
                          ? col.render(row)
                          : String((row as Record<string, unknown>)[col.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {padBottom > 0 ? <SpacerRow height={padBottom} columns={columns.length} /> : null}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Keeps the scroll height right for the rows that are not rendered. */
function SpacerRow({ height, columns }: { height: number; columns: number }) {
  return (
    <tr aria-hidden="true" style={{ height }}>
      <td colSpan={columns} className="p-0" />
    </tr>
  );
}
