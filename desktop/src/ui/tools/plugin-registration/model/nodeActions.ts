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
  return node.kind === "assembly" ? [] : [];
}
