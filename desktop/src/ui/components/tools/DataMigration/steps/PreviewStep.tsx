import { useState } from "react";
import { Button } from "../../../ui/Button";
import { Spinner } from "../../../ui/Spinner";
import { usePreviewRecords } from "../../../../api/hooks/usePreviewRecords";

interface PreviewStepProps {
  entityLogicalName: string;
  attributes: string[];
  fetchXmlFilter: string;
  onNext: () => void;
  onBack: () => void;
}

const PAGE_SIZE = 50;

export function PreviewStep({
  entityLogicalName,
  attributes,
  fetchXmlFilter,
  onNext,
  onBack,
}: PreviewStepProps) {
  const [page, setPage] = useState(1);
  const [pagingCookieStack, setPagingCookieStack] = useState<(string | null)[]>([null]);

  const currentCookie = pagingCookieStack[page - 1] ?? undefined;

  const { data, isLoading, error } = usePreviewRecords({
    entityLogicalName,
    attributes,
    fetchXmlFilter: fetchXmlFilter || undefined,
    pageSize: PAGE_SIZE,
    pagingCookie: currentCookie,
    page,
  });

  const goNext = () => {
    if (!data?.pagingCookie) return;
    setPagingCookieStack((prev) => [...prev, data.pagingCookie]);
    setPage((p) => p + 1);
  };

  const goPrev = () => {
    if (page <= 1) return;
    setPagingCookieStack((prev) => prev.slice(0, -1));
    setPage((p) => p - 1);
  };

  const displayAttrs = attributes.filter((a) => !a.endsWith("id") || a === attributes[0]).slice(0, 8);

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#858585]">
          {data?.totalEstimate != null
            ? `Showing page ${page} · ~${data.totalEstimate.toLocaleString()} total records`
            : `Page ${page}`}
        </p>
        {isLoading && <Spinner size={14} />}
      </div>

      {error && (
        <p className="text-sm text-[#f48771] bg-[#3c1e1e] border border-red-700 rounded-sm px-3 py-2">
          {(error as Error).message}
        </p>
      )}

      <div className="flex-1 overflow-auto border border-[#3c3c3c] rounded-sm">
        <table className="w-full text-sm text-[#cccccc] border-collapse">
          <thead className="bg-[#252526] sticky top-0">
            <tr>
              {displayAttrs.map((a) => (
                <th key={a} className="text-left px-3 py-2 text-xs font-medium text-[#858585] uppercase border-b border-[#3c3c3c]">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.records ?? []).map((row, i) => (
              <tr key={i} className="border-b border-[#3c3c3c] last:border-0 hover:bg-[#2a2d2e]">
                {displayAttrs.map((a) => (
                  <td key={a} className="px-3 py-2 text-xs text-[#cccccc] max-w-[200px] truncate">
                    {String(row[a] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
            {!isLoading && (data?.records ?? []).length === 0 && (
              <tr>
                <td colSpan={displayAttrs.length} className="px-3 py-6 text-center text-[#858585] text-xs">
                  No records found matching the filter criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between pt-1">
        <button onClick={onBack} className="text-sm text-[#858585] hover:text-white transition-colors">
          ← Back
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={goPrev}
            disabled={page <= 1 || isLoading}
            className="text-xs text-[#858585] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-xs text-[#858585]">Page {page}</span>
          <button
            onClick={goNext}
            disabled={!data?.moreRecords || isLoading}
            className="text-xs text-[#858585] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>

        <Button onClick={onNext}>Migrate →</Button>
      </div>
    </div>
  );
}
