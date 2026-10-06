import { useEffect, useState } from "react";
import { Button, Modal, Textarea } from "../../../shared/ui";

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
      <Textarea
        aria-label="Query description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        className="min-h-24 bg-surface p-3 text-fg-strong"
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
