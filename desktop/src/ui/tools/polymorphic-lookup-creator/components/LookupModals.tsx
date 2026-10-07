import { Button, Modal } from "../../../shared/ui";

export function DiscardChangesModal({
  open,
  onCancel,
  onDiscard,
}: {
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
}) {
  return (
    <Modal open={open} title="Discard unsaved changes?" onClose={onCancel}>
      <p className="text-sm text-fg">Discard unsaved lookup changes?</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onDiscard}>Discard</Button>
      </div>
    </Modal>
  );
}

export function RemoveRelationshipsModal({
  open,
  tableNames,
  busy,
  onCancel,
  onSave,
}: {
  open: boolean;
  /** Display names of the referenced tables that will be removed. */
  tableNames: { key: string; label: string }[];
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open={open}
      title="Remove relationships?"
      busy={busy}
      busyLabel="Saving lookup…"
      onClose={() => {
        if (!busy) onCancel();
      }}
    >
      <p className="text-sm text-fg">These referenced tables will be removed:</p>
      <ul className="list-disc pl-5 text-sm text-fg-strong">
        {tableNames.map((item) => (
          <li key={item.key}>{item.label}</li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={busy} onClick={onSave}>
          Save
        </Button>
      </div>
    </Modal>
  );
}

export function DeleteLookupModal({
  open,
  displayName,
  schemaName,
  busy,
  deleting,
  onCancel,
  onDelete,
}: {
  open: boolean;
  displayName: string;
  schemaName: string;
  /** Any write is running, so the buttons are disabled. */
  busy: boolean;
  /** The delete itself is running, so the dialog shows its spinner. */
  deleting: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal
      open={open}
      title="Delete lookup"
      busy={deleting}
      busyLabel="Deleting lookup…"
      onClose={() => {
        if (!busy) onCancel();
      }}
    >
      <p className="text-sm text-fg">
        Delete {displayName} ({schemaName})?
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={busy} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </Modal>
  );
}
