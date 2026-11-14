import { describe, expect, it } from "vitest";

import { droppedLeft, neighborShift, tabDropIndex, type TabSlot } from "../src/ui/shell/tabs/tabDropIndex";

/** Lays tabs of the given widths side by side from 0. */
function strip(...widths: number[]): TabSlot[] {
  let left = 0;
  return widths.map((width) => {
    const slot = { left, width };
    left += width;
    return slot;
  });
}

describe("tab drop index", () => {
  // A narrow Welcome tab, then wider tool tabs: the strip the app starts with.
  const tabs = strip(90, 130, 130, 180);

  it("keeps a tab in place until its edge passes a neighbor's middle", () => {
    expect(tabDropIndex(tabs, 1, 90)).toBe(1);
    expect(tabDropIndex(tabs, 1, 60)).toBe(1);
    expect(tabDropIndex(tabs, 1, 44)).toBe(0);
    expect(tabDropIndex(tabs, 1, 150)).toBe(1);
    expect(tabDropIndex(tabs, 1, 160)).toBe(2);
  });

  it("moves a middle tab to the start, past a narrower first tab", () => {
    // Pushed against the left end, a 130 wide tab's middle (65) is still right of Welcome's (45).
    expect(tabDropIndex(tabs, 2, 0)).toBe(0);
    expect(tabDropIndex(tabs, 1, 0)).toBe(0);
  });

  it("moves a middle tab to the end, past a neighbor of any width", () => {
    const end = 90 + 130 + 130 + 180;
    expect(tabDropIndex(tabs, 1, end - 130)).toBe(3);
    // A wide tab past narrow ones.
    const narrowLast = strip(90, 200, 60, 60);
    expect(tabDropIndex(narrowLast, 1, 90 + 60 + 60)).toBe(3);
  });

  it("moves the last tab to the start and the first to the end", () => {
    expect(tabDropIndex(tabs, 3, 0)).toBe(0);
    expect(tabDropIndex(tabs, 0, 530 - 90)).toBe(3);
  });

  it("passes a neighbor at the same point in both directions", () => {
    // Tab 1 passes tab 2 once its left edge is half of tab 2's width into its own slot.
    const swapPoint = 90 + 130 / 2;
    expect(tabDropIndex(tabs, 1, swapPoint + 1)).toBe(2);
    expect(tabDropIndex(tabs, 1, swapPoint - 1)).toBe(1);
  });

  it("returns the same position for a tab that is not in the strip", () => {
    expect(tabDropIndex(tabs, 9, 0)).toBe(9);
  });
});

describe("neighbor shift and dropped slot", () => {
  const tabs = strip(90, 130, 130, 180);

  it("slides only the tabs between the origin and the target, by the dragged tab's width", () => {
    // Tab 1 (130 wide) hovering over position 3: tabs 2 and 3 slide left.
    expect([0, 2, 3].map((position) => neighborShift(position, 1, 3, 130))).toEqual([0, -130, -130]);
    // Tab 3 (180 wide) hovering over position 0: everything before it slides right.
    expect([0, 1, 2].map((position) => neighborShift(position, 3, 0, 180))).toEqual([180, 180, 180]);
    expect([0, 2, 3].map((position) => neighborShift(position, 1, 1, 130))).toEqual([0, 0, 0]);
  });

  it("drops the tab flush against the neighbors it ends up between", () => {
    expect(droppedLeft(tabs, 1, 1)).toBe(90);
    expect(droppedLeft(tabs, 2, 0)).toBe(0);
    // Moving right, the tabs it passed close the gap, so it ends where the target ended.
    expect(droppedLeft(tabs, 1, 3)).toBe(530 - 130);
    expect(droppedLeft(tabs, 0, 2)).toBe(350 - 90);
  });
});
