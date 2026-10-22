import { Alert, Button, Modal } from "../../../shared/ui";
import type { ComponentCount } from "../model/types";

interface DiscardModalProps {
  open: boolean;
  changes: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DiscardModal({ open, changes, onConfirm, onCancel }: DiscardModalProps) {
  return (
    <Modal open={open} title="Discard changes" onClose={onCancel} widthClass="max-w-md">
      <p className="text-sm text-fg">{`Discard ${changes} unsaved change${changes === 1 ? "" : "s"}?`}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          Discard
        </Button>
      </div>
    </Modal>
  );
}

interface PublishModalProps {
  open: boolean;
  friendlyName: string;
  otherComponents: ComponentCount[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function PublishModal({ open, friendlyName, otherComponents, onConfirm, onCancel }: PublishModalProps) {
  return (
    <Modal open={open} title="Publish command bar changes" onClose={onCancel} widthClass="max-w-lg">
      <p className="text-sm text-fg">
        {`Publishing re-imports the solution ${friendlyName} and publishes the changed tables. This can take several minutes, and the solution's other components are imported again too.`}
      </p>
      {otherComponents.length > 0 ? (
        <Alert tone="warn">
          {`This solution has components other than tables and ribbons (${otherComponents
            .map((component) => `${component.count} ${component.name.toLowerCase()}`)
            .join(", ")}). A solution that contains only the tables to edit is recommended.`}
        </Alert>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm}>Publish</Button>
      </div>
    </Modal>
  );
}
