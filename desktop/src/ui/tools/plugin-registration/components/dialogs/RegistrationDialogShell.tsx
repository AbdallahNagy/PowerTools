import { Button, Modal } from "../../../../shared/ui";
import type { DialogIntent } from "../../PluginRegistration";
import type { CatalogTreeNode } from "../../model/catalogTree";

interface RegistrationDialogShellProps {
  intent: DialogIntent;
  node: CatalogTreeNode | null;
  onClose: () => void;
}

export function RegistrationDialogShell({ intent, node, onClose }: RegistrationDialogShellProps) {
  if (!intent) return null;
  const title = dialogTitle(intent, node);

  return (
    <Modal open title={title} onClose={onClose} widthClass="max-w-lg">
      <div role="dialog" aria-label={title} className="flex flex-col gap-4">
        <p className="text-sm text-[#cccccc]">
          This dialog records the selected registration intent. Saving changes is not connected in this read-only workspace.
        </p>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

function dialogTitle(intent: NonNullable<DialogIntent>, node: CatalogTreeNode | null): string {
  switch (intent.kind) {
    case "registerAssembly":
      return "Register assembly";
    case "createStep":
      return "Register step";
    case "createImage":
      return "Register image";
    case "unregisterStep":
      return "Unregister step";
    case "unregisterImage":
      return "Unregister image";
    case "cascadeUnregister":
      return `Unregister ${nodeKindLabel(node)}`;
    case "toggleStep":
      return `${intent.enable ? "Enable" : "Disable"} step`;
    case "update":
      return `Update ${nodeKindLabel(node)}`;
  }
}

function nodeKindLabel(node: CatalogTreeNode | null): string {
  switch (node?.kind) {
    case "assembly": return "assembly";
    case "plugin": return "plug-in";
    case "workflowActivity": return "workflow activity";
    case "step": return "step";
    case "image": return "image";
    default: return "registration";
  }
}
