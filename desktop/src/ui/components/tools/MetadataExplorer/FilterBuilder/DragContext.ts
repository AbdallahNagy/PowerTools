import { createContext } from "react";

export interface DragContextValue {
  dragId: string | null;
  beginDrag: (id: string) => void;
  endDrag: () => void;
  /** Returns true if a node being dragged could legally be dropped into `parentId`. */
  canDropInto: (parentId: string) => boolean;
}

export const DragContext = createContext<DragContextValue | null>(null);
