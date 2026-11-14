export interface TabSlot {
  left: number;
  width: number;
}

/**
 * Where a dragged tab would land. `tabs` is the strip as it was laid out when
 * the drag began, `from` the dragged tab's position in it, and `draggedLeft`
 * where the dragged tab's left edge is now.
 *
 * The tab passes a neighbor when its leading edge crosses that neighbor's
 * middle: the left edge going left, the right edge going right. Comparing
 * middles instead would leave a wide tab unable to pass a narrow one at
 * either end of the strip.
 */
export function tabDropIndex(tabs: readonly TabSlot[], from: number, draggedLeft: number): number {
  const dragged = tabs[from];
  if (!dragged) return from;
  const draggedRight = draggedLeft + dragged.width;

  let index = 0;
  tabs.forEach((tab, position) => {
    if (position === from) return;
    const middle = tab.left + tab.width / 2;
    if (position < from ? middle <= draggedLeft : middle < draggedRight) index += 1;
  });
  return index;
}

/** How far each tab is drawn from its own slot while `from` hovers over `to`. The dragged tab itself is not included. */
export function neighborShift(position: number, from: number, to: number, draggedWidth: number): number {
  if (from < to && position > from && position <= to) return -draggedWidth;
  if (to < from && position >= to && position < from) return draggedWidth;
  return 0;
}

/** The left edge of the slot the dragged tab takes when dropped at `to`. */
export function droppedLeft(tabs: readonly TabSlot[], from: number, to: number): number {
  const dragged = tabs[from];
  const target = tabs[to];
  if (!dragged || !target) return dragged?.left ?? 0;
  if (to > from) return target.left + target.width - dragged.width;
  return target.left;
}
