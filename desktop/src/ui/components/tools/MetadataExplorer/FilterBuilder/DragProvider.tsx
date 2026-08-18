import { useCallback, useMemo, useState, type ReactNode } from "react";

import type { FilterGroup, FilterNode } from "../model/types";
import { DragContext, type DragContextValue } from "./DragContext";

function collectIds(node: FilterNode, out: Set<string>): void {
  out.add(node.id);
  if (node.kind === "group") {
    for (const child of node.children) collectIds(child, out);
  } else if (node.kind === "relationship") {
    collectIds(node.group, out);
  }
}

function findNode(root: FilterGroup, id: string): FilterNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    if (child.id === id) return child;
    if (child.kind === "group") {
      const found = findNode(child, id);
      if (found) return found;
    } else if (child.kind === "relationship") {
      const found = findNode(child.group, id);
      if (found) return found;
    }
  }
  return null;
}

export function DragProvider({ root, children }: { root: FilterGroup; children: ReactNode }) {
  const [dragId, setDragId] = useState<string | null>(null);

  const canDropInto = useCallback(
    (parentId: string): boolean => {
      if (!dragId) return true;
      const dragged = findNode(root, dragId);
      if (!dragged) return true;
      if (dragged.kind === "condition") return true;
      const forbidden = new Set<string>();
      collectIds(dragged, forbidden);
      return !forbidden.has(parentId);
    },
    [dragId, root],
  );

  const value = useMemo<DragContextValue>(
    () => ({
      dragId,
      beginDrag: setDragId,
      endDrag: () => setDragId(null),
      canDropInto,
    }),
    [dragId, canDropInto],
  );

  return <DragContext.Provider value={value}>{children}</DragContext.Provider>;
}
