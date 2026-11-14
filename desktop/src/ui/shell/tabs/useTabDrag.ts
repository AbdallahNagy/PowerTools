import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** How far the pointer travels before a press turns into a drag, so a click stays a click. */
const DRAG_THRESHOLD = 5;
/** Dragging this close to an end of the strip scrolls it. */
const EDGE_SCROLL_ZONE = 28;
const EDGE_SCROLL_STEP = 12;
const SETTLE = "transform 150ms ease";

interface DragState {
  id: string;
  startX: number;
  pointerX: number;
  active: boolean;
  /** Where the tab sat in the strip when the drag began. */
  originLeft: number;
  startScroll: number;
}

interface TabDragOptions {
  stripRef: RefObject<HTMLDivElement | null>;
  /** Tab ids in strip order. */
  order: readonly string[];
  onMove: (tabId: string, toIndex: number) => void;
  onDragStart?: (tabId: string) => void;
}

function tabElements(strip: HTMLElement): HTMLElement[] {
  return Array.from(strip.querySelectorAll<HTMLElement>("[data-tab-id]"));
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Drag a tab along the strip to reorder it. The tab follows the pointer and
 * its neighbors slide out of the way as it passes their middle.
 */
export function useTabDrag({ stripRef, order, onMove, onDragStart }: TabDragOptions) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const drag = useRef<DragState | null>(null);
  const swallowNextClick = useRef(false);
  /** Where each neighbor was drawn just before a reorder, to slide it from there. */
  const before = useRef<Map<string, number> | null>(null);
  const stopListening = useRef<(() => void) | null>(null);

  /** Keep the dragged tab under the pointer whatever its current slot is. */
  const follow = useCallback((): { element: HTMLElement; left: number } | null => {
    const state = drag.current;
    const strip = stripRef.current;
    if (!state?.active || !strip) return null;
    const tabs = tabElements(strip);
    const element = tabs.find((tab) => tab.dataset.tabId === state.id);
    if (!element) return null;

    const wanted =
      state.originLeft + (state.pointerX - state.startX) + (strip.scrollLeft - state.startScroll);
    const last = tabs[tabs.length - 1];
    const end = last.offsetLeft + last.offsetWidth;
    const left = Math.max(0, Math.min(end - element.offsetWidth, wanted));
    element.style.transition = "none";
    element.style.transform = `translateX(${left - element.offsetLeft}px)`;
    return { element, left };
  }, [stripRef]);

  // After a reorder: put the dragged tab back under the pointer and slide the neighbors.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const previous = before.current;
    before.current = null;
    if (!strip) return;
    follow();
    if (!previous || reducedMotion()) return;

    for (const tab of tabElements(strip)) {
      const id = tab.dataset.tabId;
      if (!id || id === drag.current?.id || !previous.has(id)) continue;
      tab.style.transition = "none";
      tab.style.transform = "";
      const delta = (previous.get(id) ?? 0) - tab.getBoundingClientRect().left;
      if (delta === 0) continue;
      tab.style.transform = `translateX(${delta}px)`;
      // Read layout so the browser starts the slide from the old position.
      void tab.offsetWidth;
      tab.style.transition = SETTLE;
      tab.style.transform = "";
    }
  }, [order, follow, stripRef]);

  const startDrag = useCallback(
    (tabId: string, event: React.PointerEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest("[data-tab-close]")) return;
      const strip = stripRef.current;
      if (!strip) return;

      drag.current = {
        id: tabId,
        startX: event.clientX,
        pointerX: event.clientX,
        active: false,
        originLeft: 0,
        startScroll: 0,
      };

      const move = (moveEvent: PointerEvent) => {
        const state = drag.current;
        if (!state) return;
        state.pointerX = moveEvent.clientX;

        if (!state.active) {
          if (Math.abs(state.pointerX - state.startX) < DRAG_THRESHOLD) return;
          const element = tabElements(strip).find((tab) => tab.dataset.tabId === state.id);
          if (!element) return;
          state.active = true;
          state.originLeft = element.offsetLeft;
          state.startScroll = strip.scrollLeft;
          setDraggingId(state.id);
          onDragStart?.(state.id);
        }

        const bounds = strip.getBoundingClientRect();
        if (state.pointerX < bounds.left + EDGE_SCROLL_ZONE) strip.scrollLeft -= EDGE_SCROLL_STEP;
        else if (state.pointerX > bounds.right - EDGE_SCROLL_ZONE) strip.scrollLeft += EDGE_SCROLL_STEP;

        const placed = follow();
        if (!placed) return;

        // The tab takes the slot after every neighbor whose middle it has passed.
        const tabs = tabElements(strip);
        const center = placed.left + placed.element.offsetWidth / 2;
        let index = 0;
        for (const tab of tabs) {
          if (tab !== placed.element && tab.offsetLeft + tab.offsetWidth / 2 < center) index += 1;
        }
        if (index === tabs.indexOf(placed.element)) return;

        before.current = new Map(
          tabs.map((tab) => [tab.dataset.tabId ?? "", tab.getBoundingClientRect().left]),
        );
        onMove(state.id, index);
      };

      const end = () => {
        stopListening.current?.();
        const state = drag.current;
        drag.current = null;
        if (!state?.active) return;

        // The release also fires a click on the tab under the pointer; it is not a selection.
        swallowNextClick.current = true;
        window.setTimeout(() => {
          swallowNextClick.current = false;
        }, 0);

        const element = tabElements(strip).find((tab) => tab.dataset.tabId === state.id);
        if (element) {
          element.style.transition = reducedMotion() ? "none" : SETTLE;
          element.style.transform = "";
        }
        setDraggingId(null);
      };

      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        stopListening.current = null;
      };
      stopListening.current?.();
      stopListening.current = stop;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [follow, onDragStart, onMove, stripRef],
  );

  useEffect(() => () => stopListening.current?.(), []);

  /** Put on the strip's capture phase: drops the click that ends a drag. */
  const swallowDragClick = useCallback((event: React.MouseEvent) => {
    if (!swallowNextClick.current) return;
    swallowNextClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return { draggingId, startDrag, swallowDragClick };
}
