import { Alert, Button, Modal } from "../../../shared/ui";
import type { ComponentRow, Layer } from "../model/types";

export const REMOVAL_WARNING =
  "This permanently discards unmanaged customizations for this component. It cannot be undone. Some components, such as forms, views, and site maps, may need a publish before the change appears.";

interface RemoveActiveDialogProps {
  open: boolean;
  component: ComponentRow;
  typeLabel: string;
  fallback: Layer | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RemoveActiveDialog({
  open,
  component,
  typeLabel,
  fallback,
  busy,
  error,
  onCancel,
  onConfirm,
}: RemoveActiveDialogProps) {
  return (
    <Modal
      open={open}
      title="Remove Active layer"
      onClose={onCancel}
      busy={busy}
      busyLabel="Removing Active layer…"
      widthClass="max-w-lg"
    >
      <p className="text-sm text-fg">
        Remove the unmanaged Active layer of <strong>{component.name || component.logicalName}</strong> ({typeLabel})?
        The component falls back to the layer below:{" "}
        <strong>{fallback?.solutionName ?? ""}</strong> {fallback?.solutionVersion ?? ""}
      </p>
      <Alert tone="warn">{REMOVAL_WARNING}</Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>
          Remove Active layer
        </Button>
      </div>
    </Modal>
  );
}
