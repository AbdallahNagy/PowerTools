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
  enabled: boolean;
  disabledReason: string | null;
}

interface RegistrationActionPolicy {
  contextActions: RegistrationAction[];
  doubleClickIntent: Extract<RegistrationActionIntent, { kind: "update" }> | null;
}

export interface RegistrationActionContext {
  cascadeUnregister?: { supported: boolean; reason: string };
}

export function registrationActionsForNode(
  node: CatalogTreeNode,
  context: RegistrationActionContext = {},
): RegistrationAction[] {
  return registrationActionPolicyForNode(node, context).contextActions;
}

export function doubleClickIntentForNode(
  node: CatalogTreeNode,
): Extract<RegistrationActionIntent, { kind: "update" }> | null {
  return registrationActionPolicyForNode(node).doubleClickIntent;
}

export function isRegistrationActionSupported(
  node: CatalogTreeNode,
  intent: RegistrationActionIntent,
  context: RegistrationActionContext = {},
): boolean {
  return registrationActionPolicyForNode(node, context).contextActions.some(
    (action) => sameIntent(action.intent, intent) && action.enabled,
  );
}

export function dialogOwnerForIntent(intent: RegistrationActionIntent): string | null {
  switch (intent.kind) {
    case "update": {
      const [kind] = intent.nodeId.split(":");
      if (kind === "plugin") return null;
      return `update:${intent.nodeId}`;
    }
    case "createStep":
      return `step:create:${intent.pluginId}`;
    case "createImage":
      return `image:create:${intent.stepId}`;
    case "toggleStep":
      return `step:${intent.enable ? "enable" : "disable"}:${intent.stepId}`;
    case "unregister": {
      const [kind, id] = intent.nodeId.split(":");
      if (kind === "step") return `step:unregister:${id}`;
      if (kind === "image") return `image:unregister:${id}`;
      return `cascade:${intent.nodeId}`;
    }
  }
}

function registrationActionPolicyForNode(
  node: CatalogTreeNode,
  context: RegistrationActionContext = {},
): RegistrationActionPolicy {
  const update = (label: string): RegistrationAction & {
    intent: Extract<RegistrationActionIntent, { kind: "update" }>;
  } => {
    const created = action(label, { kind: "update", nodeId: node.id });
    return { ...created, intent: { kind: "update", nodeId: node.id } };
  };
  const cascadeUnavailable = context.cascadeUnregister && !context.cascadeUnregister.supported
    ? { enabled: false as const, disabledReason: context.cascadeUnregister.reason }
    : {};
  const unregister = (label: string, cascade = false): RegistrationAction =>
    action(label, { kind: "unregister", nodeId: node.id }, cascade ? cascadeUnavailable : {});

  switch (node.kind) {
    case "assembly":
      return editablePolicy(update("Update assembly"), unregister("Unregister assembly", true));
    case "plugin":
      return {
        contextActions: [
          action("Register New Step", { kind: "createStep", pluginId: node.data.id }),
          unregister("Unregister plug-in", true),
        ],
        doubleClickIntent: null,
      };
    case "workflowActivity":
      return editablePolicy(
        update("Update workflow activity"),
        unregister("Unregister workflow activity", true),
      );
    case "step":
      return editablePolicy(
        update("Update step"),
        action("Register image", { kind: "createImage", stepId: node.data.id }),
        action(node.data.isEnabled ? "Disable step" : "Enable step", {
          kind: "toggleStep",
          stepId: node.data.id,
          enable: !node.data.isEnabled,
        }),
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

function action(
  label: string,
  intent: RegistrationActionIntent,
  availability: { enabled?: boolean; disabledReason?: string | null } = {},
): RegistrationAction {
  const enabled = availability.enabled ?? true;
  return {
    label,
    intent,
    enabled,
    disabledReason: enabled ? null : availability.disabledReason ?? "This action is unavailable.",
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
