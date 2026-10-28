import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Modal, Spinner } from "../../../shared/ui";
import { useDeletions } from "../api/usePreviewRecords";
import { DELETE_EXPLANATION } from "../model/recordAction";

interface EnableDeleteDialogProps {
  open: boolean;
  entityLogicalName: string | null;
  hasFilter: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Shown when Delete is ticked, before it is turned on. */
export function EnableDeleteDialog({
  open,
  entityLogicalName,
  hasFilter,
  onCancel,
  onConfirm,
}: EnableDeleteDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title="Turn on Delete?" widthClass="max-w-lg">
      <Alert tone="danger" title="Records in the target will be deleted">
        {DELETE_EXPLANATION}
      </Alert>
      <ul className="list-disc pl-5 text-sm text-fg flex flex-col gap-1">
        <li>
          {hasFilter
            ? `Only ${entityLogicalName ?? "target"} records that match your filter in the target are considered.`
            : `No filter is set, so every ${entityLogicalName ?? "target"} record in the target is considered.`}
        </li>
        <li>Records are matched by ID, not by name. A record with the same name but another ID is deleted.</li>
        <li>Deleting can cascade to related records, depending on the relationship settings in the target.</li>
        <li>Before each target runs, you see how many records will be deleted and confirm that number.</li>
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Keep Delete off
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          Turn on Delete
        </Button>
      </div>
    </Modal>
  );
}

interface ConfirmDeleteDialogProps {
  /** The target about to be migrated, or null when closed. */
  target: { id: string; name: string } | null;
  sourceConnectionId: string;
  entityLogicalName: string;
  fetchXmlFilter: string;
  onCancel: () => void;
  /** Called with the number of deletions the user agreed to. */
  onConfirm: (confirmedDeleteCount: number) => void;
}

/** Lists the target records a run will delete and asks for that exact number. */
export function ConfirmDeleteDialog({
  target,
  sourceConnectionId,
  entityLogicalName,
  fetchXmlFilter,
  onCancel,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const [understood, setUnderstood] = useState(false);
  const { data, isLoading, error } = useDeletions(
    target
      ? {
          connectionId: sourceConnectionId,
          targetConnectionId: target.id,
          entityLogicalName,
          fetchXmlFilter: fetchXmlFilter || undefined,
        }
      : null,
  );

  useEffect(() => {
    setUnderstood(false);
  }, [target?.id]);

  const count = data?.count ?? 0;
  const noSource = !!data && data.sourceCount === 0 && count > 0;
  const needsConsent = count > 0;
  const canConfirm = !!data && !noSource && (!needsConsent || understood);

  return (
    <Modal
      open={!!target}
      onClose={onCancel}
      title={`Delete records in ${target?.name ?? ""}?`}
      widthClass="max-w-2xl"
    >
      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-fg-muted" aria-live="polite">
          <Spinner size={14} /> Finding {entityLogicalName} records in {target?.name} that are not in the source…
        </p>
      )}

      {error && (
        <Alert tone="danger" title="Could not check which records would be deleted">
          {(error as Error).message} Nothing has been changed.
        </Alert>
      )}

      {data && count === 0 && (
        <Alert tone="ok">
          No {entityLogicalName} records in {target?.name} would be deleted: every matching target record is in the
          source.
        </Alert>
      )}

      {noSource && (
        <Alert tone="danger" title="The source returned no records">
          No source records match, so Delete would remove all {count.toLocaleString()} matching records in{" "}
          {target?.name}. This usually means a wrong source connection, filter, or missing read access, so the run is
          blocked. Turn Delete off to migrate without deleting.
        </Alert>
      )}

      {data && count > 0 && !noSource && (
        <>
          <Alert tone="danger" title={`${count.toLocaleString()} ${count === 1 ? "record" : "records"} will be deleted`}>
            These {entityLogicalName} records match the filter in {target?.name} but are not in the source. They are
            deleted after the create and update step.
          </Alert>
          <div className="max-h-64 overflow-auto border border-line rounded-sm">
            <table className="w-full text-xs text-fg border-collapse">
              <thead className="bg-surface sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-fg-muted border-b border-line">ID</th>
                  <th className="text-left px-3 py-2 font-medium text-fg-muted border-b border-line">Name</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-1.5 font-mono">{r.id}</td>
                    <td className="px-3 py-1.5">{r.name ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.records.length < count && (
            <p className="text-xs text-fg-muted">
              Showing the first {data.records.length.toLocaleString()} of {count.toLocaleString()}.
            </p>
          )}
          <label className="flex items-start gap-2 text-sm text-fg cursor-pointer">
            <Checkbox checked={understood} onChange={setUnderstood} className="mt-0.5" />
            <span>
              I understand that {count.toLocaleString()} {entityLogicalName} records will be permanently deleted from{" "}
              {target?.name}.
            </span>
          </label>
          <p className="text-xs text-fg-muted">
            If more records would be deleted when the run starts, it deletes none and tells you.
          </p>
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant={needsConsent ? "danger" : "primary"}
          disabled={!canConfirm}
          onClick={() => onConfirm(count)}
        >
          {needsConsent ? `Delete ${count.toLocaleString()} and migrate` : "Migrate"}
        </Button>
      </div>
    </Modal>
  );
}
