import { useRef, useState, type PointerEvent } from "react";
import { cn } from "./cn";
import { DEFAULT_COLUMN_WIDTH, type ColumnResize } from "./useColumnResize";

interface ColumnResizeHandleProps {
  resize: ColumnResize;
  columnKey: string;
}

/**
 * Drag handle on the right edge of a header cell. The header cell must be
 * `position: relative`. A double click puts the column back to its
 * automatic width. The handle is hidden from assistive technology so it does
 * not become part of the column header's name.
 */
export function ColumnResizeHandle({ resize, columnKey }: ColumnResizeHandleProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const widths = resize.measure();
    drag.current = { startX: event.clientX, startWidth: widths[columnKey] ?? DEFAULT_COLUMN_WIDTH };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current == null) return;
    resize.setWidth(columnKey, drag.current.startWidth + event.clientX - drag.current.startX);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current == null) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
  };

  return (
    <div
      aria-hidden="true"
      data-column-resize={columnKey}
      title="Drag to resize. Double-click to reset this column."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      // The header cell may sort on click; a resize must not.
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        resize.resetColumn(columnKey);
      }}
      className={cn(
        "absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none",
        "after:absolute after:inset-y-1 after:right-0 after:w-0.5 after:rounded-full",
        "hover:after:bg-line-strong",
        dragging && "after:bg-accent-text hover:after:bg-accent-text",
      )}
    />
  );
}
