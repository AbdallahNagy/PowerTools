import type { FilterGroup, FilterNode } from "./types.ts";
import { NO_VALUE_OPERATORS } from "./operators.ts";
import { getConditionScope, getFieldReference } from "./fetchxml.ts";

export interface ValidationError {
  nodeId: string;
  message: string;
}

export function validateTree(root: FilterGroup): ValidationError[] {
  if (
    root.children.length <= 1 &&
    root.children[0].kind === "condition" &&
    !root.children[0].field &&
    !root.children[0].fieldRef &&
    !root.children[0].operator
  )
    return [];

  const errors: ValidationError[] = [];

  function walk(node: FilterNode) {
    if (node.kind === "group") {
      if (node.children.length === 0) {
        errors.push({ nodeId: node.id, message: "Group is empty" });
      }
      if (node.logic === "or") {
        const scopes = new Set<string>();
        for (const child of node.children) {
          if (child.kind === "condition") {
            scopes.add(getConditionScope(child));
          }
        }
        if (scopes.size > 1) {
          errors.push({
            nodeId: node.id,
            message: "OR groups can only combine conditions from the same table path.",
          });
        }
      }
      for (const child of node.children) walk(child);
    } else {
      const fieldRef = getFieldReference(node);
      if (!fieldRef) {
        errors.push({ nodeId: node.id, message: "Select a field" });
      }
      if (fieldRef?.kind === "related" && fieldRef.path.length === 0) {
        errors.push({ nodeId: node.id, message: "Select a relationship path" });
      }
      if (!node.operator) {
        errors.push({ nodeId: node.id, message: "Select an operator" });
      }
      if (node.operator && !NO_VALUE_OPERATORS.includes(node.operator)) {
        const empty =
          node.value == null || (Array.isArray(node.value) ? node.value.length === 0 : node.value.trim() === "");
        if (empty) {
          errors.push({ nodeId: node.id, message: "Enter a value" });
        }
      }
    }
  }

  walk(root);
  return errors;
}

export function isTreeValid(root: FilterGroup): boolean {
  return validateTree(root).length === 0;
}
