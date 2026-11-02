import { Alert, Button, Modal } from "../../../shared/ui";

interface DeleteDialogProps {
  title: string;
  message: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirms deleting a variable or its current value. Nothing is removed until Delete is chosen. */
export function DeleteDialog({ title, message, busy, error, onCancel, onConfirm }: DeleteDialogProps) {
  return (
    <Modal open title={title} onClose={onCancel} busy={busy} busyLabel="Deleting…" widthClass="max-w-md">
      <p className="text-sm text-fg">{message}</p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          Delete
        </Button>
      </div>
    </Modal>
  );
}
