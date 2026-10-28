import { useEffect, useState } from "react";
import { Badge, Field, Modal, Select, Spinner, cn } from "../../../shared/ui";
import { usePreviewRecords, useRecordCount, useTargetCount } from "../api/usePreviewRecords";
import type { RunMigrationArgs } from "../api/useMigrationJob";
import { plannedAction, totalActionsSummary, type PlannedAction } from "../model/recordAction";
import { apiErrorText } from "../model/apiError";

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  entityLogicalName: string;
  fetchXmlFilter: string;
  mode: RunMigrationArgs["mode"];
  /** Targets the records can be compared with, in the user's order. */
  targets: { id: string; name: string }[];
  /** Target selected when the modal opens. */
  defaultTargetId: string | null;
}

const PAGE_SIZE = 50;

export function PreviewModal({
  open,
  onClose,
  connectionId,
  entityLogicalName,
  fetchXmlFilter,
  mode,
  targets,
  defaultTargetId,
}: PreviewModalProps) {
  const [page, setPage] = useState(1);
  const [pagingCookieStack, setPagingCookieStack] = useState<
    (string | null)[]
  >([null]);
  const [targetId, setTargetId] = useState<string | null>(null);

  // Reset paging and the compared target each time the modal opens.
  useEffect(() => {
    if (open) {
      setPage(1);
      setPagingCookieStack([null]);
      setTargetId(defaultTargetId);
    }
  }, [open, defaultTargetId]);

  const currentCookie = pagingCookieStack[page - 1] ?? undefined;
  const comparedTarget = targets.find((t) => t.id === targetId) ?? null;

  const { data, isLoading, isFetching, error } = usePreviewRecords(
    open
      ? {
          connectionId,
          targetConnectionId: comparedTarget?.id,
          entityLogicalName,
          fetchXmlFilter: fetchXmlFilter || undefined,
          pageSize: PAGE_SIZE,
          pagingCookie: currentCookie,
          page,
        }
      : null
  );
  const countArgs = open
    ? {
        connectionId,
        entityLogicalName,
        fetchXmlFilter: fetchXmlFilter || undefined,
      }
    : null;
  const count = useRecordCount(countArgs);
  const targetCount = useTargetCount(
    countArgs && comparedTarget
      ? { ...countArgs, targetConnectionId: comparedTarget.id }
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

  const rows = (data?.records ?? []).map((r) => ({
    ...r,
    planned: plannedAction(mode, r.existsInTarget),
  }));
  const totals = targetCount.data
    ? totalActionsSummary(mode, targetCount.data.count, targetCount.data.existing)
    : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Preview — ${entityLogicalName}`}
      widthClass="max-w-4xl"
    >
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <p
            className={cn("text-sm font-medium", count.error ? "text-danger" : "text-fg-strong")}
            aria-live="polite"
          >
            {count.isLoading
              ? "Counting records…"
              : count.error
                ? `Could not count the records: ${apiErrorText(count.error, "The count request failed.")}`
                : count.data
                  ? `${count.data.count.toLocaleString()} ${count.data.count === 1 ? "record" : "records"} will be migrated`
                  : null}
          </p>
          {comparedTarget && (
            <p className={cn("text-xs", targetCount.error ? "text-danger" : "text-fg-muted")}>
              {targetCount.isLoading
                ? `Checking the records in ${comparedTarget.name}…`
                : targetCount.error
                  ? `Could not check the records in ${comparedTarget.name}: ${apiErrorText(targetCount.error, "The request failed.")}`
                  : totals}
            </p>
          )}
        </div>
        <div className="flex items-end gap-3">
          {isFetching && <Spinner size={14} />}
          {targets.length > 0 && (
            <Field label="Compare with">
              <Select
                value={comparedTarget?.id ?? ""}
                onChange={(e) => setTargetId(e.target.value || null)}
                className="w-64"
              >
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </div>

      {targets.length === 0 && mode === "upsert" && (
        <p className="text-xs text-fg-muted">
          Add a target to see whether each record will be created or updated.
        </p>
      )}

      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger rounded-sm px-3 py-2">
          {apiErrorText(error, "Could not load the preview.")}
        </p>
      )}

      <div className="flex-1 min-h-48 overflow-auto border border-line rounded-sm">
        <table className="w-full text-sm text-fg border-collapse">
          <thead className="bg-surface sticky top-0">
            <tr>
              {["Action", "ID", "Name"].map((h) => (
                <th
                  key={h}
                  className="text-left px-3 py-2 text-xs font-medium text-fg-muted border-b border-line"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-line last:border-0 hover:bg-hover"
              >
                <td className="px-3 py-2 text-xs w-36">
                  <ActionBadge planned={row.planned} />
                </td>
                <td className="px-3 py-2 text-xs font-mono text-fg w-80">{row.id}</td>
                <td className="px-3 py-2 text-xs text-fg max-w-[280px] truncate">
                  {row.name ?? ""}
                </td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={3}
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

function ActionBadge({ planned }: { planned: PlannedAction }) {
  if (!planned.action) return <span className="text-fg-muted">—</span>;
  const label = planned.action === "create" ? "Create" : "Update";
  if (planned.problem) {
    return (
      <span title={planned.problem}>
        <Badge tone="danger">{label} · will fail</Badge>
      </span>
    );
  }
  return <Badge tone={planned.action === "create" ? "ok" : "accent"}>{label}</Badge>;
}
