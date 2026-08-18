import { useContext } from "react";

import { DragContext } from "./DragContext";

export function useDrag() {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error("useDrag must be used inside DragProvider");
  return ctx;
}
