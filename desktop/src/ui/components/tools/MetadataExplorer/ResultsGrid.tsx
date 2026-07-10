import { useState } from "react";
import type { FetchResult } from "./model/types";
import { Spinner } from "../../ui/Spinner";
import { Button } from "../../ui/Button";

const PAGE_SIZE = 50;

interface ResultsGridProps {
  result: FetchResult | null;
  isLoading: boolean;
  error: string | null;
  page: number;
  onPageChange: (page: number) => void;
}

export function ResultsGrid({ result, isLoading, error, page, onPageChange }: ResultsGridProps) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[#858585] text-sm p-4">
        <Spinner size={16} /> Running query…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-[#f48771] bg-[#3c1e1e] border border-red-700 rounded-sm px-4 py-3">
        {error}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center flex-1 text-[#555] text-sm">
        Run a query to see results.
      </div>
    );
  }

  const columns = result.columns;

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

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[#858585]">
          {result.records.length} records
          {result.totalEstimate != null && ` (est. total: ${result.totalEstimate})`}
          {result.moreRecords && " — more available"}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto border border-[#3c3c3c] rounded-sm">
        <table className="w-full text-sm text-[#cccccc] border-collapse">
          <thead className="bg-[#252526] sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="text-left px-3 py-2 font-medium text-[#858585] text-xs uppercase tracking-wider border-b border-[#3c3c3c] cursor-pointer hover:text-[#cccccc] whitespace-nowrap select-none"
                >
                  {col}
                  {sortCol === col && (
                    <span className="ml-1">{sortDesc ? "↓" : "↑"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length || 1} className="px-3 py-6 text-center text-[#858585] text-xs">
                  No records found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={String(row.id)} className="border-b border-[#3c3c3c] last:border-0 hover:bg-[#2a2d2e]">
                  {columns.map((col) => (
                    <td key={col} className="px-3 py-1.5 text-xs max-w-xs truncate" title={String(row[col] ?? "")}>
                      {formatCell(row[col])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paging */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="text-xs py-0.5 px-2" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          ← Prev
        </Button>
        <span className="text-xs text-[#858585]">Page {page}</span>
        <Button variant="ghost" className="text-xs py-0.5 px-2" onClick={() => onPageChange(page + 1)} disabled={!result.moreRecords}>
          Next →
        </Button>
        <span className="text-xs text-[#858585] ml-auto">{PAGE_SIZE} per page</span>
      </div>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
