import { Button, Modal } from "../../../../shared/ui";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  isPending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  isPending,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} title={title} onClose={onClose} widthClass="max-w-lg">
      <p className="text-sm text-[var(--color-text-gray)]">{message}</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="button" onClick={onConfirm} disabled={isPending}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
