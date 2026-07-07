import { useState } from "react";
import { useDrag } from "./DragContext";

interface DropSlotProps {
  parentId: string;
  index: number;
  onDrop: (dragId: string, parentId: string, index: number) => void;
}

/**
 * A thin horizontal strip between children that acts as an insertion point.
 * Reserves a tiny amount of space always so layout does not shift when a drag starts.
 */
export function DropSlot({ parentId, index, onDrop }: DropSlotProps) {
  const { dragId, canDropInto, endDrag } = useDrag();
  const [over, setOver] = useState(false);
  const active = dragId !== null && canDropInto(parentId);

  return (
    <div
      onDragOver={(e) => {
        if (!active) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={(e) => {
        if (!active) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!active || !dragId) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        onDrop(dragId, parentId, index);
        endDrag();
      }}
      className={`h-1 -my-0.5 rounded-sm transition-colors ${
        active ? (over ? "bg-[#007fd4]" : "bg-[#264f78]/40") : ""
      }`}
    />
  );
}

