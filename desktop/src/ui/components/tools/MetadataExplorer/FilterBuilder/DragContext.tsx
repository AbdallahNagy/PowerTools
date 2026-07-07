import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { FilterGroup, FilterNode } from "../model/types";

interface DragContextValue {
  dragId: string | null;
  beginDrag: (id: string) => void;
  endDrag: () => void;
  /** Returns true if a node being dragged could legally be dropped into `parentId`. */
  canDropInto: (parentId: string) => boolean;
}

const DragCtx = createContext<DragContextValue | null>(null);

function collectIds(node: FilterNode, out: Set<string>): void {
  out.add(node.id);
  if (node.kind === "group") {
    for (const c of node.children) collectIds(c, out);
  }
}

function findNode(root: FilterGroup, id: string): FilterNode | null {
  if (root.id === id) return root;
  for (const c of root.children) {
    if (c.id === id) return c;
    if (c.kind === "group") {
      const f = findNode(c, id);
      if (f) return f;
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
      if (dragged.kind !== "group") return true;
      // Cannot drop a group into itself or any descendant.
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

  return <DragCtx.Provider value={value}>{children}</DragCtx.Provider>;
}

export function useDrag() {
  const ctx = useContext(DragCtx);
  if (!ctx) throw new Error("useDrag must be used inside DragProvider");
  return ctx;
}
