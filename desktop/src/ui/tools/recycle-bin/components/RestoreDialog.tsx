import { Alert, Badge, Button, DataTable, Modal, ProgressBar } from "../../../shared/ui";
import { formatDate } from "../model/dates";
import type { DeletedRecord, RestoreEntry, RestoreStatus, Source } from "../model/types";
import { displayName, restoreSummary, summaryText } from "../model/view";

export type RestorePhase = "confirm" | "running" | "done";

const AUDIT_WARNING =
  "Each record is recreated only from the field values shown in its details. Fields that were not audited, links to other records stored outside the record, notes, and files do not come back. Plug-ins and flows that run when a record is created will run.";
const BIN_WARNING =
  "Each record comes back from the recycle bin with its original field values. Records it points to that were also deleted must be restored first. Plug-ins and flows registered on the Restore message will run.";

const resultBadge: Record<RestoreStatus, { tone: "ok" | "danger" | "neutral"; label: string }> = {
  restored: { tone: "ok", label: "Restored" },
  failed: { tone: "danger", label: "Failed" },
  skipped: { tone: "neutral", label: "Skipped" },
  alreadyRestored: { tone: "ok", label: "Already restored" },
};

const resultColumns = [
  { key: "name", header: "Record", render: (entry: RestoreEntry) => entry.name },
  {
    key: "status",
    header: "Result",
    render: (entry: RestoreEntry) => (
      <Badge tone={resultBadge[entry.status].tone}>{resultBadge[entry.status].label}</Badge>
    ),
  },
  { key: "detail", header: "Detail", render: (entry: RestoreEntry) => entry.detail },
];

interface RestoreDialogProps {
  source: Source;
  tableName: string;
  rows: DeletedRecord[];
  repeated: number;
  phase: RestorePhase;
  entries: RestoreEntry[];
  stopping: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onStop: () => void;
  onDone: () => void;
}

export function RestoreDialog({
  source,
  tableName,
  rows,
  repeated,
  phase,
  entries,
  stopping,
  onCancel,
  onConfirm,
  onStop,
  onDone,
}: RestoreDialogProps) {
  const total = rows.length;
  // The dialog cannot be closed while records are being restored; Stop ends the run instead.
  const close = phase === "confirm" ? onCancel : phase === "done" ? onDone : () => {};
  const summary = restoreSummary(entries);

  return (
    <Modal open title="Restore deleted records" onClose={close} widthClass="max-w-2xl">
      {phase === "confirm" ? (
        <>
          {repeated > 0 ? (
            <Alert tone="warn">
              {repeated} {repeated === 1 ? "record was" : "records were"} deleted more than once. Only the most recent
              deletion of each is restored.
            </Alert>
          ) : null}
          <p className="text-sm text-fg">
            Recreate these {total} records in <strong>{tableName}</strong> with their original IDs?
          </p>
          <ul aria-label="Records to restore" className="max-h-40 overflow-auto text-sm text-fg">
            {rows.map((row) => (
              <li key={row.key}>
                {displayName(row)}
                {row.deletedOn ? ` · deleted ${formatDate(row.deletedOn)}` : ""}
              </li>
            ))}
          </ul>
          <Alert tone="warn">{source === "bin" ? BIN_WARNING : AUDIT_WARNING}</Alert>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onConfirm}>
              Restore {total} records
            </Button>
          </div>
        </>
      ) : (
        <>
          <ProgressBar value={entries.length} max={total} label={`${entries.length} of ${total} done`} />
          <DataTable
            columns={resultColumns}
            rows={entries}
            getRowKey={(entry) => entry.key}
            emptyMessage="Restoring records…"
            className="max-h-72"
          />
          <div className="flex items-center justify-end gap-2">
            {phase === "running" ? (
              <Button variant="secondary" onClick={onStop} disabled={stopping}>
                {stopping ? "Stopping…" : "Stop"}
              </Button>
            ) : (
              <>
                <p className="flex-1 text-sm text-fg">
                  {summaryText(summary)}
                </p>
                <Button variant="primary" onClick={onDone}>
                  Done
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
