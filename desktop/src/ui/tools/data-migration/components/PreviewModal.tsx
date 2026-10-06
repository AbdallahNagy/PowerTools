import { useEffect, useState } from "react";
import { Modal, Spinner } from "../../../shared/ui";
import { usePreviewRecords } from "../api/usePreviewRecords";

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  connectionName: string;
  entityLogicalName: string;
  attributes: string[];
  fetchXmlFilter: string;
}

const PAGE_SIZE = 50;

export function PreviewModal({
  open,
  onClose,
  connectionName,
  entityLogicalName,
  attributes,
  fetchXmlFilter,
}: PreviewModalProps) {
  const [page, setPage] = useState(1);
  const [pagingCookieStack, setPagingCookieStack] = useState<
    (string | null)[]
  >([null]);

  // Reset paging each time the modal opens.
  useEffect(() => {
    if (open) {
      setPage(1);
      setPagingCookieStack([null]);
    }
  }, [open]);

  const currentCookie = pagingCookieStack[page - 1] ?? undefined;

  const { data, isLoading, error } = usePreviewRecords(
    open
      ? {
          connectionName,
          entityLogicalName,
          attributes,
          fetchXmlFilter: fetchXmlFilter || undefined,
          pageSize: PAGE_SIZE,
          pagingCookie: currentCookie,
          page,
        }
      : null
  );

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

  const displayAttrs = attributes
    // .filter((a) => !a.endsWith("id") || a === attributes[0])
    // .slice(0, 8);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Preview — ${entityLogicalName}`}
      widthClass="max-w-4xl"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          {data?.totalEstimate != null
            ? `Showing page ${page} · ~${data.totalEstimate.toLocaleString()} total records`
            : `Page ${page}`}
        </p>
        {isLoading && <Spinner size={14} />}
      </div>

      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger rounded-sm px-3 py-2">
          {(error as Error).message}
        </p>
      )}

      <div className="flex-1 min-h-48 overflow-auto border border-line rounded-sm">
        <table className="w-full text-sm text-fg border-collapse">
          <thead className="bg-surface sticky top-0">
            <tr>
              {displayAttrs.map((a) => (
                <th
                  key={a}
                  className="text-left px-3 py-2 text-xs font-medium text-fg-muted border-b border-line"
                >
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.records ?? []).map((row, i) => (
              <tr
                key={i}
                className="border-b border-line last:border-0 hover:bg-hover"
              >
                {displayAttrs.map((a) => (
                  <td
                    key={a}
                    className="px-3 py-2 text-xs text-fg max-w-[200px] truncate"
                  >
                    {String(row[a] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
            {!isLoading && (data?.records ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={displayAttrs.length}
                  className="px-3 py-6 text-center text-fg-muted text-xs"
                >
                  No records found matching the filter criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={goPrev}
          disabled={page <= 1 || isLoading}
          className="text-xs text-fg-muted hover:text-fg-strong disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Prev
        </button>
        <span className="text-xs text-fg-muted">Page {page}</span>
        <button
          type="button"
          onClick={goNext}
          disabled={!data?.moreRecords || isLoading}
          className="text-xs text-fg-muted hover:text-fg-strong disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>
    </Modal>
  );
}
