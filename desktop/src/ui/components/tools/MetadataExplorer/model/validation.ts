import type { FilterGroup, FilterNode } from "./types";
import { NO_VALUE_OPERATORS } from "./operators";

export interface ValidationError {
  nodeId: string;
  message: string;
}

export function validateTree(root: FilterGroup): ValidationError[] {
  const errors: ValidationError[] = [];

  function walk(node: FilterNode) {
    if (node.kind === "group") {
      if (node.children.length === 0) {
        errors.push({ nodeId: node.id, message: "Group is empty" });
      }
      for (const child of node.children) walk(child);
    } else {
      if (!node.field) {
        errors.push({ nodeId: node.id, message: "Select a field" });
      }
      if (!node.operator) {
        errors.push({ nodeId: node.id, message: "Select an operator" });
      }
      if (node.operator && !NO_VALUE_OPERATORS.includes(node.operator)) {
        const empty =
          node.value == null ||
          (Array.isArray(node.value)
            ? node.value.length === 0
            : node.value.trim() === "");
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
