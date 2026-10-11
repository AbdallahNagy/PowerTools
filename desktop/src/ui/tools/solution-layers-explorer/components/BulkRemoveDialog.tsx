import { Alert, Badge, Button, DataTable, Modal, ProgressBar } from "../../../shared/ui";
import type { ComponentRow, RemovalEntry, RemovalResult } from "../model/types";
import { REMOVAL_WARNING } from "./RemoveActiveDialog";

export type BulkPhase = "confirm" | "running" | "done";

interface BulkRemoveDialogProps {
  connectionName: string;
  components: ComponentRow[];
  phase: BulkPhase;
  entries: RemovalEntry[];
  stopping: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onStop: () => void;
  onDone: () => void;
}

const resultTone: Record<RemovalResult, "ok" | "neutral" | "danger"> = {
  Removed: "ok",
  Skipped: "neutral",
  Failed: "danger",
};

const resultColumns = [
  { key: "component", header: "Component", render: (entry: RemovalEntry) => entry.name },
  {
    key: "result",
    header: "Result",
    render: (entry: RemovalEntry) => <Badge tone={resultTone[entry.result]}>{entry.result}</Badge>,
  },
  { key: "detail", header: "Detail", render: (entry: RemovalEntry) => entry.detail },
];

export function BulkRemoveDialog({
  connectionName,
  components,
  phase,
  entries,
  stopping,
  onCancel,
  onConfirm,
  onStop,
  onDone,
}: BulkRemoveDialogProps) {
  const total = components.length;
  const close = phase === "confirm" ? onCancel : phase === "done" ? onDone : () => {};

  return (
    <Modal
      open
      title="Remove Active layers"
      description={`Environment: ${connectionName}`}
      onClose={close}
      widthClass="max-w-2xl"
    >
      {phase === "confirm" ? (
        <>
          <p className="text-sm text-fg">
            Remove the unmanaged Active layer of these {total} components?
          </p>
          <ul aria-label="Components to change" className="max-h-40 overflow-auto text-sm text-fg">
            {components.map((component) => (
              <li key={component.componentId}>{component.name || component.logicalName}</li>
            ))}
          </ul>
          <Alert tone="warn">{REMOVAL_WARNING}</Alert>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="danger" onClick={onConfirm}>
              Remove {total} Active layers
            </Button>
          </div>
        </>
      ) : (
        <>
          <ProgressBar value={entries.length} max={total} label={`${entries.length} of ${total} done`} />
          <DataTable
            columns={resultColumns}
            rows={entries}
            getRowKey={(entry) => entry.componentId}
            emptyMessage="Starting…"
            className="max-h-72"
          />
          <div className="flex justify-end gap-2">
            {phase === "running" ? (
              <Button variant="secondary" onClick={onStop} disabled={stopping}>
                Stop
              </Button>
            ) : (
              <Button variant="primary" onClick={onDone}>
                Done
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
