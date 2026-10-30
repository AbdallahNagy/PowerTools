import { useEffect, useState } from "react";
import {
  Badge,
  ColumnResizeHandle,
  Field,
  Modal,
  Select,
  Spinner,
  useColumnResize,
} from "../../../shared/ui";
import { useDeletions, usePreviewRecords, useRecordCount } from "../api/usePreviewRecords";
import {
  plannedAction,
  totalActionsSummary,
  type MigrationOptions,
  type RecordAction,
} from "../model/recordAction";

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  entityLogicalName: string;
  fetchXmlFilter: string;
  options: MigrationOptions;
  /** Targets the records can be compared with, in the user's order. */
  targets: { id: string; name: string }[];
  /** Target selected when the modal opens. */
  defaultTargetId: string | null;
}

const PAGE_SIZE = 50;
const COLUMNS = ["Action", "ID", "Name"];

export function PreviewModal({
  open,
  onClose,
  connectionId,
  entityLogicalName,
  fetchXmlFilter,
  options,
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
  const count = useRecordCount(
    open
      ? {
          connectionId,
          targetConnectionId: comparedTarget?.id,
          entityLogicalName,
          fetchXmlFilter: fetchXmlFilter || undefined,
        }
      : null
  );

  const deletions = useDeletions(
    open && options.delete && comparedTarget
      ? {
          connectionId,
          targetConnectionId: comparedTarget.id,
          entityLogicalName,
          fetchXmlFilter: fetchXmlFilter || undefined,
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

  const rows = (data?.records ?? []).map((r) => ({
    ...r,
    planned: plannedAction(options, r.existsInTarget),
  }));
  const resize = useColumnResize(COLUMNS);
  const totals = count.data
    ? totalActionsSummary(options, count.data.count, count.data.existing)
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
          <p className="text-sm font-medium text-fg-strong" aria-live="polite">
            {count.isLoading
              ? comparedTarget
                ? `Counting records and checking them in ${comparedTarget.name}…`
                : "Counting records…"
              : count.error
                ? "Could not count the records."
                : count.data
                  ? `${count.data.count.toLocaleString()} ${count.data.count === 1 ? "record" : "records"} will be migrated`
                  : null}
          </p>
          {totals && <p className="text-xs text-fg-muted">{totals}</p>}
          {options.delete && comparedTarget && (
            <p className="text-xs font-medium text-danger" aria-live="polite">
              {deletions.isLoading
                ? `Finding records to delete in ${comparedTarget.name}…`
                : deletions.error
                  ? "Could not check which target records would be deleted."
                  : deletions.data
                    ? `${deletions.data.count.toLocaleString()} to delete from ${comparedTarget.name} (in the target, not in the source)`
                    : null}
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

      {targets.length === 0 && (options.create && options.update || options.delete) && (
        <p className="text-xs text-fg-muted">
          Add a target to see what happens to each record{options.delete ? " and which records would be deleted" : ""}.
        </p>
      )}

      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger rounded-sm px-3 py-2">
          {(error as Error).message}
        </p>
      )}

      <div className="flex-1 min-h-48 overflow-auto border border-line rounded-sm">
        <table ref={resize.tableRef} className="w-full text-sm text-fg border-collapse" style={resize.tableStyle}>
          <thead className="bg-surface sticky top-0">
            <tr>
              {COLUMNS.map((h) => (
                <th
                  key={h}
                  {...resize.headerProps(h)}
                  className="relative text-left px-3 py-2 text-xs font-medium text-fg-muted border-b border-line"
                >
                  {h}
                  <ColumnResizeHandle resize={resize} columnKey={h} />
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
                <td className={`px-3 py-2 text-xs ${resize.resized ? "" : "w-36"}`}>
                  <ActionBadge planned={row.planned} />
                </td>
                <td className={`px-3 py-2 text-xs font-mono text-fg truncate ${resize.resized ? "" : "w-80"}`}>
                  {row.id}
                </td>
                <td className={`px-3 py-2 text-xs text-fg truncate ${resize.resized ? "" : "max-w-[280px]"}`}>
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

const actionLabels: Record<RecordAction, string> = { create: "Create", update: "Update", skip: "Skip" };
const actionTones = { create: "ok", update: "accent", skip: "neutral" } as const;

function ActionBadge({ planned }: { planned: RecordAction | null }) {
  if (!planned) return <span className="text-fg-muted">—</span>;
  return <Badge tone={actionTones[planned]}>{actionLabels[planned]}</Badge>;
}
