import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { FetchResult, FieldMetadata } from "../model/types";
import { Button, ColumnResizeHandle, Spinner, useColumnResize } from "../../../shared/ui";
import { buildDynamicsRecordUrl, useOpenInBrowser } from "../../../shared/connections";
import { formatFetchResultSummary } from "../model/resultSummary";
import { orderResultColumns } from "../model/columns";

const PAGE_SIZE = 50;
const EMPTY_COLUMNS: string[] = [];
const ADD_COLUMN_KEY = "__add-column";

interface ResultsGridProps {
  result: FetchResult | null;
  isLoading: boolean;
  error: string | null;
  page: number;
  onPageChange: (page: number) => void;
  fieldMeta?: FieldMetadata[];
  entityLogicalName?: string | null;
  envUrl?: string | null;
  /** Columns the last run asked for, shown first and in this order. */
  requestedColumns?: string[];
  onAddColumn?: () => void;
  onRemoveColumn?: (column: string) => void;
}

export function ResultsGrid({
  result,
  isLoading,
  error,
  page,
  onPageChange,
  fieldMeta,
  entityLogicalName,
  envUrl,
  requestedColumns = EMPTY_COLUMNS,
  onAddColumn,
  onRemoveColumn,
}: ResultsGridProps) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(false);
  const openInBrowser = useOpenInBrowser();

  const displayNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of fieldMeta ?? []) map[f.logicalName] = f.displayName;
    return map;
  }, [fieldMeta]);

  const columns = result ? orderResultColumns(requestedColumns, result.columns) : EMPTY_COLUMNS;
  const resize = useColumnResize(onAddColumn ? [...columns, ADD_COLUMN_KEY] : columns);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-fg-muted text-sm p-4">
        <Spinner size={16} /> Running query…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-danger bg-danger-soft border border-danger rounded-sm px-4 py-3">
        {error}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center flex-1 text-fg-muted text-sm">
        Run a query to see results.
      </div>
    );
  }

  const requestedSet = new Set(requestedColumns);

  let rows = result.records;
  if (sortCol) {
    rows = [...rows].sort((a, b) => {
      const av = String(a[sortCol] ?? "");
      const bv = String(b[sortCol] ?? "");
      return sortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
    });
  }

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDesc((d) => !d);
    else { setSortCol(col); setSortDesc(false); }
  };

  const handleOpenRecord = (row: Record<string, unknown>) => {
    if (!envUrl || !entityLogicalName || typeof row.id !== "string" || row.id.length === 0) return;

    void openInBrowser(
      buildDynamicsRecordUrl({
        envUrl,
        entityLogicalName,
        recordId: row.id,
      }),
    );
  };

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-fg-muted">
          {formatFetchResultSummary({
            fetchedCount: result.records.length,
            totalEstimate: result.totalEstimate,
            moreRecords: result.moreRecords,
          })}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto border border-line rounded-sm">
        <table ref={resize.tableRef} className="w-full text-sm text-fg border-collapse" style={resize.tableStyle}>
          <thead className="bg-surface sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  {...resize.headerProps(col)}
                  onClick={() => handleSort(col)}
                  className="group relative text-left px-3 py-2 font-medium text-fg-muted text-xs tracking-wider border-b border-line cursor-pointer hover:text-fg whitespace-nowrap select-none"
                >
                  {displayNames[col] ?? col}
                  {sortCol === col && (
                    <span className="ml-1 inline-flex align-middle" aria-hidden="true">
                      {sortDesc ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                    </span>
                  )}
                  {onRemoveColumn && requestedSet.has(col) && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveColumn(col);
                      }}
                      aria-label={`Remove column ${displayNames[col] ?? col}`}
                      title="Remove column"
                      className="ml-1 inline-flex align-middle rounded-sm p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-hover hover:text-fg-strong"
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                  <ColumnResizeHandle resize={resize} columnKey={col} />
                </th>
              ))}
              {onAddColumn && (
                <th {...resize.headerProps(ADD_COLUMN_KEY)} className="px-2 py-1 border-b border-line w-8 text-right">
                  <button
                    type="button"
                    onClick={onAddColumn}
                    aria-label="Add column"
                    title="Add column"
                    className="inline-flex rounded-sm p-1 text-fg-muted hover:text-fg-strong hover:bg-hover"
                  >
                    <Plus size={14} aria-hidden="true" />
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (onAddColumn ? 1 : 0) || 1} className="px-3 py-6 text-center text-fg-muted text-xs">
                  No records found.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const canOpenRecord = !!envUrl && !!entityLogicalName && typeof row.id === "string" && row.id.length > 0;
                return (
                <tr
                  key={String(row.id)}
                  onClick={() => handleOpenRecord(row)}
                  title={canOpenRecord ? "Open record in Dynamics CRM" : undefined}
                  className={`border-b border-line last:border-0 hover:bg-hover ${
                    canOpenRecord ? "cursor-pointer" : ""
                  }`}
                >
                  {columns.map((col) => (
                    <td key={col} className={`px-3 py-1.5 text-xs truncate ${resize.resized ? "" : "max-w-xs"}`} title={formatCell(row[col], result.columnTypes[col])}>
                      {formatCell(row[col], result.columnTypes[col])}
                    </td>
                  ))}
                  {onAddColumn && <td />}
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paging */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="text-xs py-0.5 px-2" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          ← Prev
        </Button>
        <span className="text-xs text-fg-muted">Page {page}</span>
        <Button variant="ghost" className="text-xs py-0.5 px-2" onClick={() => onPageChange(page + 1)} disabled={!result.moreRecords}>
          Next →
        </Button>
        <span className="text-xs text-fg-muted ml-auto">{PAGE_SIZE} per page</span>
      </div>
    </div>
  );
}

function formatCell(v: unknown, typeTag?: string): string {
  if (v == null) return "";
  if (typeTag === "lookup") {
    const ref = v as { id: string; name: string | null };
    return ref.name ?? ref.id;
  }
  if (typeTag === "datetime" && typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleString();
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
