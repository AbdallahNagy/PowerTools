import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";

import { droppedLeft, neighborShift, tabDropIndex, type TabSlot } from "./tabDropIndex";

/** How far the pointer travels before a press turns into a drag, so a click stays a click. */
const DRAG_THRESHOLD = 5;
/** Dragging this close to an end of the strip scrolls it. */
const EDGE_SCROLL_ZONE = 28;
const EDGE_SCROLL_STEP = 12;
const SLIDE_MS = 160;
const SLIDE = `transform ${SLIDE_MS}ms cubic-bezier(0.2, 0, 0, 1)`;

interface DragState {
  id: string;
  startX: number;
  pointerX: number;
  active: boolean;
  /** The strip as it was laid out when the drag began. It is not re-laid out until the drop. */
  slots: TabSlot[];
  elements: HTMLElement[];
  from: number;
  to: number;
  startScroll: number;
}

interface TabDragOptions {
  stripRef: RefObject<HTMLDivElement | null>;
  onMove: (tabId: string, toIndex: number) => void;
  /** A tab was pressed. Runs before any drag, so the tab is already selected when it starts to move. */
  onPress?: (tabId: string) => void;
}

function tabElements(strip: HTMLElement): HTMLElement[] {
  return Array.from(strip.querySelectorAll<HTMLElement>("[data-tab-id]"));
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Draw every tab in its own slot again, at once. */
function release(elements: readonly HTMLElement[]) {
  for (const element of elements) {
    element.style.transition = "";
    element.style.transform = "";
  }
}

/**
 * Drag a tab along the strip to reorder it. The tab follows the pointer and
 * its neighbors slide aside as its edge passes their middle. Nothing is
 * reordered until the drop: the strip keeps its layout and every tab is only
 * drawn somewhere else, so tool content is not disturbed while dragging.
 */
export function useTabDrag({ stripRef, onMove, onPress }: TabDragOptions) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const drag = useRef<DragState | null>(null);
  const swallowNextClick = useRef(false);
  const stopListening = useRef<(() => void) | null>(null);
  /** Finishes a drop that is still sliding into place. */
  const finishDrop = useRef<(() => void) | null>(null);
  const alive = useRef(true);

  /** Draw the dragged tab under the pointer and its neighbors around the slot it would take. */
  const draw = useCallback(() => {
    const state = drag.current;
    const strip = stripRef.current;
    if (!state?.active || !strip) return;

    const dragged = state.slots[state.from];
    const last = state.slots[state.slots.length - 1];
    const wanted =
      dragged.left + (state.pointerX - state.startX) + (strip.scrollLeft - state.startScroll);
    const left = Math.max(0, Math.min(last.left + last.width - dragged.width, wanted));
    state.to = tabDropIndex(state.slots, state.from, left);

    state.elements.forEach((element, position) => {
      const offset =
        position === state.from
          ? left - dragged.left
          : neighborShift(position, state.from, state.to, dragged.width);
      element.style.transform = offset === 0 ? "" : `translateX(${offset}px)`;
    });
  }, [stripRef]);

  const startDrag = useCallback(
    (tabId: string, event: React.PointerEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest("[data-tab-close]")) return;
      const strip = stripRef.current;
      if (!strip) return;

      // A press while the last drop is still sliding lands on the finished strip.
      finishDrop.current?.();
      onPress?.(tabId);

      drag.current = {
        id: tabId,
        startX: event.clientX,
        pointerX: event.clientX,
        active: false,
        slots: [],
        elements: [],
        from: -1,
        to: -1,
        startScroll: 0,
      };

      const move = (moveEvent: PointerEvent) => {
        const state = drag.current;
        if (!state) return;
        state.pointerX = moveEvent.clientX;

        if (!state.active) {
          if (Math.abs(state.pointerX - state.startX) < DRAG_THRESHOLD) return;
          const elements = tabElements(strip);
          const from = elements.findIndex((element) => element.dataset.tabId === state.id);
          if (from < 0) return;
          state.active = true;
          state.elements = elements;
          state.slots = elements.map((element) => ({ left: element.offsetLeft, width: element.offsetWidth }));
          state.from = from;
          state.to = from;
          state.startScroll = strip.scrollLeft;
          const slide = reducedMotion() ? "none" : SLIDE;
          elements.forEach((element, position) => {
            element.style.transition = position === from ? "none" : slide;
          });
          setDraggingId(state.id);
        }

        const bounds = strip.getBoundingClientRect();
        if (state.pointerX < bounds.left + EDGE_SCROLL_ZONE) strip.scrollLeft -= EDGE_SCROLL_STEP;
        else if (state.pointerX > bounds.right - EDGE_SCROLL_ZONE) strip.scrollLeft += EDGE_SCROLL_STEP;
        draw();
      };

      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", drop);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", cancelOnEscape, true);
        stopListening.current = null;
      };

      /** Ends the drag. `commit` false puts every tab back where it started. */
      const end = (commit: boolean) => {
        stop();
        const state = drag.current;
        drag.current = null;
        if (!state?.active) return;

        // The release also fires a click on the tab under the pointer; it is not a selection.
        swallowNextClick.current = true;
        window.setTimeout(() => {
          swallowNextClick.current = false;
        }, 0);

        const to = commit ? state.to : state.from;
        const dragged = state.elements[state.from];
        const slide = reducedMotion() ? "none" : SLIDE;
        if (!commit) {
          state.elements.forEach((element, position) => {
            if (position === state.from) return;
            element.style.transition = slide;
            element.style.transform = "";
          });
        }
        // Slide the dragged tab the rest of the way into its slot, then make the move real.
        dragged.style.transition = slide;
        const rest = droppedLeft(state.slots, state.from, to) - state.slots[state.from].left;
        dragged.style.transform = rest === 0 ? "" : `translateX(${rest}px)`;

        let timer = 0;
        const finish = () => {
          window.clearTimeout(timer);
          finishDrop.current = null;
          if (!alive.current) return;
          // Reorder for real and stop offsetting in the same frame: each tab's slot is now where
          // it was being drawn, so nothing jumps.
          flushSync(() => {
            setDraggingId(null);
            if (to !== state.from) onMove(state.id, to);
          });
          release(state.elements);
        };
        finishDrop.current = finish;
        if (slide === "none") finish();
        else timer = window.setTimeout(finish, SLIDE_MS + 20);
      };

      const drop = () => end(true);
      const cancel = () => end(false);
      const cancelOnEscape = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key !== "Escape" || !drag.current?.active) return;
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        cancel();
      };

      stopListening.current?.();
      stopListening.current = stop;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", drop);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", cancelOnEscape, true);
    },
    [draw, onMove, onPress, stripRef],
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopListening.current?.();
    };
  }, []);

  /** Put on the strip's capture phase: drops the click that ends a drag. */
  const swallowDragClick = useCallback((event: React.MouseEvent) => {
    if (!swallowNextClick.current) return;
    swallowNextClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  return { draggingId, startDrag, swallowDragClick };
}
