import { useEffect, useState } from "react";
import { Button, Modal } from "../../../shared/ui";

interface SaveQueryModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (description: string) => void;
}

export function SaveQueryModal({ open, onClose, onSave }: SaveQueryModalProps) {
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) setDescription("");
  }, [open]);

  return (
    <Modal open={open} title="Save query" onClose={onClose}>
      <textarea
        aria-label="Query description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        className="min-h-24 w-full resize-y rounded-sm border border-[var(--color-border-dark)] bg-[var(--color-bg-darker)] p-3 text-sm text-[var(--color-text-white)] focus:border-[var(--color-primary)] focus:outline-none"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={() => onSave(description)}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
