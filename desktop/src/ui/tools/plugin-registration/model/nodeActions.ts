import type { TreeNode } from "./catalogTree";

export type NodeActionId =
  | "register-step"
  | "update-step"
  | "enable-step"
  | "disable-step"
  | "unregister-step"
  | "register-image"
  | "update-image"
  | "unregister-image"
  | "update-assembly"
  | "unregister-assembly"
  | "unregister-type";

export interface NodeAction {
  id: NodeActionId;
  label: string;
  disabledReason?: string;
}

export function isReadOnlyNode(node: TreeNode): boolean {
  return node.data.isManaged || node.data.isSystem;
}

export function readOnlyReason(node: TreeNode): string | undefined {
  if (node.data.isManaged) return "Managed registrations cannot be changed.";
  if (node.data.isSystem) return "System registrations cannot be changed.";
  return undefined;
}

export function getNodeActions(node: TreeNode): NodeAction[] {
  const reason = readOnlyReason(node);
  switch (node.kind) {
    case "assembly":
      return [
        action("update-assembly", "Update assembly", reason),
        action("unregister-assembly", "Unregister assembly", reason),
      ];
    case "type":
      return [
        action("register-step", "Register step", reason),
        action("unregister-type", "Unregister type", reason),
      ];
    case "step":
      return [
        action("update-step", "Update step", reason),
        node.data.isEnabled
          ? action("disable-step", "Disable step", reason)
          : action("enable-step", "Enable step", reason),
        action("register-image", "Register image", reason),
        action("unregister-step", "Unregister step", reason),
      ];
    case "image":
      return [
        action("update-image", "Update image", reason),
        action("unregister-image", "Unregister image", reason),
      ];
  }
}

function action(id: NodeActionId, label: string, disabledReason?: string): NodeAction {
  return { id, label, disabledReason };
}
