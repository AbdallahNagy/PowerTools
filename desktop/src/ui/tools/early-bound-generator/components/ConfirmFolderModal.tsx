import { Button, Modal } from "../../../shared/ui";

interface ConfirmFolderModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Asked once per folder per tab, when the folder already has files. */
export function ConfirmFolderModal({ open, onCancel, onConfirm }: ConfirmFolderModalProps) {
  return (
    <Modal open={open} title="Generate into this folder?" onClose={onCancel} widthClass="max-w-md">
      <p className="text-sm text-fg">
        This folder already has files. Generated files with the same names will be replaced. Other files are left
        alone.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm}>Generate</Button>
      </div>
    </Modal>
  );
}
