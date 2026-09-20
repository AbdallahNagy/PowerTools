import { Button, Modal } from "../../../../shared/ui";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  isPending?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  isPending,
  busyLabel = "Working…",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const closeDialog = () => {
    if (isPending) return;
    onClose();
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={closeDialog}
      widthClass="max-w-lg"
      busy={!!isPending}
      busyLabel={busyLabel}
    >
      <p className="text-sm text-[var(--color-text-gray)]">{message}</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={closeDialog} disabled={isPending}>
          Cancel
        </Button>
        <Button type="button" onClick={onConfirm} disabled={isPending}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
