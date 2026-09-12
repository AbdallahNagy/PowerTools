import type { CatalogNodeId, CatalogTreeNode } from "./catalogTree";

export type RegistrationActionIntent =
  | { kind: "update"; nodeId: CatalogNodeId }
  | { kind: "createStep"; pluginId: string }
  | { kind: "createImage"; stepId: string }
  | { kind: "unregister"; nodeId: CatalogNodeId }
  | { kind: "toggleStep"; stepId: string; enable: boolean };

export interface RegistrationAction {
  label: string;
  intent: RegistrationActionIntent;
}

interface RegistrationActionPolicy {
  contextActions: RegistrationAction[];
  doubleClickIntent: Extract<RegistrationActionIntent, { kind: "update" }> | null;
}

export function registrationActionsForNode(node: CatalogTreeNode): RegistrationAction[] {
  return registrationActionPolicyForNode(node).contextActions;
}

export function doubleClickIntentForNode(
  node: CatalogTreeNode,
): Extract<RegistrationActionIntent, { kind: "update" }> | null {
  return registrationActionPolicyForNode(node).doubleClickIntent;
}

export function isRegistrationActionSupported(
  node: CatalogTreeNode,
  intent: RegistrationActionIntent,
): boolean {
  return registrationActionPolicyForNode(node).contextActions.some(
    (action) => sameIntent(action.intent, intent),
  );
}

function registrationActionPolicyForNode(node: CatalogTreeNode): RegistrationActionPolicy {
  const update = (label: string): RegistrationAction & {
    intent: Extract<RegistrationActionIntent, { kind: "update" }>;
  } => ({
    label,
    intent: { kind: "update", nodeId: node.id },
  });
  const unregister = (label: string): RegistrationAction => ({
    label,
    intent: { kind: "unregister", nodeId: node.id },
  });

  switch (node.kind) {
    case "assembly":
      return editablePolicy(update("Update assembly"), unregister("Unregister assembly"));
    case "plugin":
      return {
        contextActions: [
          { label: "Register step", intent: { kind: "createStep", pluginId: node.data.id } },
          unregister("Unregister plug-in"),
        ],
        doubleClickIntent: null,
      };
    case "workflowActivity":
      return editablePolicy(
        update("Update workflow activity"),
        unregister("Unregister workflow activity"),
      );
    case "step":
      return editablePolicy(
        update("Update step"),
        { label: "Register image", intent: { kind: "createImage", stepId: node.data.id } },
        {
          label: node.data.isEnabled ? "Disable step" : "Enable step",
          intent: { kind: "toggleStep", stepId: node.data.id, enable: !node.data.isEnabled },
        },
        unregister("Unregister step"),
      );
    case "image":
      return editablePolicy(update("Update image"), unregister("Unregister image"));
  }
}

function editablePolicy(
  updateAction: RegistrationAction & {
    intent: Extract<RegistrationActionIntent, { kind: "update" }>;
  },
  ...otherActions: RegistrationAction[]
): RegistrationActionPolicy {
  return {
    contextActions: [updateAction, ...otherActions],
    doubleClickIntent: updateAction.intent,
  };
}

function sameIntent(left: RegistrationActionIntent, right: RegistrationActionIntent): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "update":
    case "unregister":
      return left.nodeId === (right as typeof left).nodeId;
    case "createStep":
      return left.pluginId === (right as typeof left).pluginId;
    case "createImage":
      return left.stepId === (right as typeof left).stepId;
    case "toggleStep": {
      const candidate = right as typeof left;
      return left.stepId === candidate.stepId && left.enable === candidate.enable;
    }
  }
}
