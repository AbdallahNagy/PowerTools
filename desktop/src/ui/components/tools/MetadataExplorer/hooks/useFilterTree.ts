import { useCallback, useReducer } from "react";
import type {
  FieldReference,
  FilterCondition,
  FilterGroup,
  FilterNode,
  FilterRelationship,
  Operator,
  RelationshipPathSegment,
} from "../model/types";

type Action =
  | { type: "add-condition"; parentId: string }
  | { type: "add-group"; parentId: string }
  | { type: "replace-with-relationship"; id: string; relationship: RelationshipPathSegment }
  | { type: "update-condition"; id: string; patch: Partial<Omit<FilterCondition, "id" | "kind">> }
  | { type: "toggle-logic"; id: string }
  | { type: "remove"; id: string }
  | { type: "duplicate"; id: string }
  | { type: "move"; id: string; targetParentId: string; targetIndex: number }
  | { type: "reset" };

function uid(): string {
  return crypto.randomUUID();
}

function makeCondition(): FilterCondition {
  return { id: uid(), kind: "condition", field: null, fieldRef: null, operator: null };
}

function makeGroup(): FilterGroup {
  return { id: uid(), kind: "group", logic: "and", children: [makeCondition()] };
}

function makeRelationship(relationship: RelationshipPathSegment): FilterRelationship {
  const id = uid();
  return {
    id,
    kind: "relationship",
    relationship: withScopeAlias(relationship, id),
    group: makeGroup(),
  };
}

function cloneNode(n: FilterNode): FilterNode {
  if (n.kind === "condition") return { ...n, id: uid() };
  if (n.kind === "relationship") {
    const id = uid();
    return {
      ...n,
      id,
      relationship: withScopeAlias(n.relationship, id),
      group: cloneNode(n.group) as FilterGroup,
    };
  }
  return { ...n, id: uid(), children: n.children.map(cloneNode) };
}

function withScopeAlias(
  relationship: RelationshipPathSegment,
  id: string,
): RelationshipPathSegment {
  const suffix = id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  return { ...relationship, alias: `${relationship.alias}_${suffix}` };
}

function findParent(root: FilterGroup, targetId: string): FilterGroup | null {
  for (const child of root.children) {
    if (child.id === targetId) return root;
    if (child.kind === "group") {
      const found = findParent(child, targetId);
      if (found) return found;
    } else if (child.kind === "relationship") {
      const found = findParent(child.group, targetId);
      if (found) return found;
    }
  }
  return null;
}

function findGroup(root: FilterGroup, id: string): FilterGroup | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    if (child.kind === "group") {
      const found = findGroup(child, id);
      if (found) return found;
    } else if (child.kind === "relationship") {
      const found = findGroup(child.group, id);
      if (found) return found;
    }
  }
  return null;
}

function removeNode(group: FilterGroup, id: string): FilterGroup {
  return {
    ...group,
    children: group.children
      .filter((c) => c.id !== id)
      .map((c) => {
        if (c.kind === "group") return removeNode(c, id);
        if (c.kind === "relationship") return { ...c, group: removeNode(c.group, id) };
        return c;
      }),
  };
}

function updateNode(group: FilterGroup, id: string, patch: Partial<FilterCondition>): FilterGroup {
  return {
    ...group,
    children: group.children.map((c) => {
      if (c.id === id && c.kind === "condition") return { ...c, ...patch };
      if (c.kind === "group") return updateNode(c, id, patch);
      if (c.kind === "relationship") return { ...c, group: updateNode(c.group, id, patch) };
      return c;
    }),
  };
}

function toggleLogic(group: FilterGroup, id: string): FilterGroup {
  if (group.id === id) return { ...group, logic: group.logic === "and" ? "or" : "and" };
  return {
    ...group,
    children: group.children.map((c) => {
      if (c.kind === "group") return toggleLogic(c, id);
      if (c.kind === "relationship") return { ...c, group: toggleLogic(c.group, id) };
      return c;
    }),
  };
}

function addToGroup(group: FilterGroup, parentId: string, node: FilterNode): FilterGroup {
  if (group.id === parentId) return { ...group, children: [...group.children, node] };
  return {
    ...group,
    children: group.children.map((c) => {
      if (c.kind === "group") return addToGroup(c, parentId, node);
      if (c.kind === "relationship") return { ...c, group: addToGroup(c.group, parentId, node) };
      return c;
    }),
  };
}

function setGroupChildren(group: FilterGroup, id: string, children: FilterNode[]): FilterGroup {
  if (group.id === id) return { ...group, children };
  return {
    ...group,
    children: group.children.map((child) => {
      if (child.kind === "group") return setGroupChildren(child, id, children);
      if (child.kind === "relationship") {
        return { ...child, group: setGroupChildren(child.group, id, children) };
      }
      return child;
    }),
  };
}

export function replaceConditionWithRelationshipInTree(
  group: FilterGroup,
  id: string,
  relationship: RelationshipPathSegment,
): FilterGroup {
  return {
    ...group,
    children: group.children.map((child) => {
      if (child.id === id && child.kind === "condition") return makeRelationship(relationship);
      if (child.kind === "group") {
        return replaceConditionWithRelationshipInTree(child, id, relationship);
      }
      if (child.kind === "relationship") {
        return {
          ...child,
          group: replaceConditionWithRelationshipInTree(child.group, id, relationship),
        };
      }
      return child;
    }),
  };
}

function moveNode(root: FilterGroup, id: string, targetParentId: string, targetIndex: number): FilterGroup {
  const parent = findParent(root, id);
  if (!parent) return root;
  const node = parent.children.find((c) => c.id === id);
  if (!node) return root;

  // Remove from current position
  const updated = removeNode(root, id);

  // Insert at target
  const targetGroup = findGroup(updated, targetParentId);
  if (!targetGroup) return root;

  const newChildren = [...targetGroup.children];
  newChildren.splice(targetIndex, 0, node);

  function insertInto(g: FilterGroup): FilterGroup {
    if (g.id === targetParentId) return { ...g, children: newChildren };
    return {
      ...g,
      children: g.children.map((c) => {
        if (c.kind === "group") return insertInto(c);
        if (c.kind === "relationship") return { ...c, group: insertInto(c.group) };
        return c;
      }),
    };
  }

  return insertInto(updated);
}

function reducer(state: FilterGroup, action: Action): FilterGroup {
  switch (action.type) {
    case "add-condition":
      return addToGroup(state, action.parentId, makeCondition());

    case "add-group":
      return addToGroup(state, action.parentId, makeGroup());

    case "replace-with-relationship":
      return replaceConditionWithRelationshipInTree(state, action.id, action.relationship);

    case "update-condition": {
      const patch = action.patch as Partial<FilterCondition>;
      // When field changes, reset operator and value
      if (patch.field !== undefined) {
        patch.fieldRef = patch.field ? { kind: "root", field: patch.field } : null;
        patch.operator = null as unknown as Operator;
        patch.value = undefined;
        patch.valueLabels = undefined;
        patch.lookupTarget = undefined;
      }
      if (patch.fieldRef !== undefined) {
        patch.field = patch.fieldRef?.kind === "root" ? patch.fieldRef.field : null;
        patch.operator = null as unknown as Operator;
        patch.value = undefined;
        patch.valueLabels = undefined;
        patch.lookupTarget = undefined;
      }
      // When operator changes to a no-value operator, clear value
      if (patch.operator !== undefined) {
        patch.value = undefined;
        patch.valueLabels = undefined;
      }
      return updateNode(state, action.id, patch);
    }

    case "toggle-logic":
      return toggleLogic(state, action.id);

    case "remove": {
      const parent = findParent(state, action.id);
      if (!parent) return state;
      if (parent.children.length <= 1) {
        if (parent.id === state.id) return makeInitialRoot();
        return setGroupChildren(state, parent.id, [makeCondition()]);
      }
      return removeNode(state, action.id);
    }

    case "duplicate": {
      const parent = findParent(state, action.id);
      if (!parent) return state;
      const idx = parent.children.findIndex((c) => c.id === action.id);
      if (idx < 0) return state;
      const node = parent.children[idx];
      const clone = cloneNode(node);
      const capturedParentId = parent.id;

      function insertAfter(g: FilterGroup): FilterGroup {
        if (g.id === capturedParentId) {
          const next = [...g.children];
          next.splice(idx + 1, 0, clone);
          return { ...g, children: next };
        }
        return {
          ...g,
          children: g.children.map((c) => {
            if (c.kind === "group") return insertAfter(c);
            if (c.kind === "relationship") return { ...c, group: insertAfter(c.group) };
            return c;
          }),
        };
      }

      return insertAfter(state);
    }

    case "move":
      return moveNode(state, action.id, action.targetParentId, action.targetIndex);

    case "reset":
      return makeInitialRoot();

    default:
      return state;
  }
}

function makeInitialRoot(): FilterGroup {
  return {
    id: uid(),
    kind: "group",
    logic: "and",
    children: [makeCondition()],
  };
}

export function useFilterTree() {
  const [root, dispatch] = useReducer(reducer, undefined, makeInitialRoot);

  const addCondition = useCallback((parentId: string) => dispatch({ type: "add-condition", parentId }), []);
  const addGroup = useCallback((parentId: string) => dispatch({ type: "add-group", parentId }), []);
  const replaceConditionWithRelationship = useCallback(
    (id: string, relationship: RelationshipPathSegment) =>
      dispatch({ type: "replace-with-relationship", id, relationship }),
    [],
  );
  const updateCondition = useCallback(
    (id: string, patch: Partial<Omit<FilterCondition, "id" | "kind">> & { fieldRef?: FieldReference | null }) =>
      dispatch({ type: "update-condition", id, patch }),
    [],
  );
  const toggleLogicFn = useCallback((id: string) => dispatch({ type: "toggle-logic", id }), []);
  const remove = useCallback((id: string) => dispatch({ type: "remove", id }), []);
  const duplicate = useCallback((id: string) => dispatch({ type: "duplicate", id }), []);
  const move = useCallback(
    (id: string, targetParentId: string, targetIndex: number) =>
      dispatch({ type: "move", id, targetParentId, targetIndex }),
    [],
  );
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return {
    root,
    addCondition,
    addGroup,
    replaceConditionWithRelationship,
    updateCondition,
    toggleLogic: toggleLogicFn,
    remove,
    duplicate,
    move,
    reset,
  };
}
