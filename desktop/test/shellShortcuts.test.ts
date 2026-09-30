import { describe, expect, it } from "vitest";

import {
  cycleTabId,
  matchShellShortcut,
  shouldIgnoreShellShortcut,
  type ShortcutKeyState,
} from "../src/ui/shell/keyboard/shellShortcuts";

const plainKey: ShortcutKeyState = {
  key: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
};

describe("shell shortcuts", () => {
  it("matches tab, quick open, sidebar, and primary-action shortcuts", () => {
    expect(matchShellShortcut({ ...plainKey, key: "w", ctrlKey: true })).toBe("close-tab");
    expect(matchShellShortcut({ ...plainKey, key: "W", metaKey: true })).toBe("close-tab");
    expect(matchShellShortcut({ ...plainKey, key: "Tab", ctrlKey: true })).toBe("next-tab");
    expect(matchShellShortcut({ ...plainKey, key: "Tab", ctrlKey: true, shiftKey: true })).toBe(
      "previous-tab",
    );
    expect(matchShellShortcut({ ...plainKey, key: "p", ctrlKey: true })).toBe("toggle-quick-open");
    expect(matchShellShortcut({ ...plainKey, key: "b", ctrlKey: true })).toBe("toggle-sidebar");
    expect(matchShellShortcut({ ...plainKey, key: "Enter" })).toBe("primary-action");
    expect(matchShellShortcut({ ...plainKey, key: "Enter", ctrlKey: true })).toBe(
      "primary-action-from-field",
    );
    expect(matchShellShortcut({ ...plainKey, key: "w", ctrlKey: true, altKey: true })).toBeNull();
    expect(matchShellShortcut({ ...plainKey, key: "Enter", shiftKey: true })).toBeNull();
    expect(matchShellShortcut({ ...plainKey, key: "k", ctrlKey: true })).toBeNull();
  });

  it("cycles tabs forward, backward, and through an empty list", () => {
    expect(cycleTabId(["welcome", "builder", "tester"], "builder", 1)).toBe("tester");
    expect(cycleTabId(["welcome", "builder", "tester"], "tester", 1)).toBe("welcome");
    expect(cycleTabId(["welcome", "builder", "tester"], "welcome", -1)).toBe("tester");
    expect(cycleTabId(["welcome"], "welcome", 1)).toBe("welcome");
    expect(cycleTabId([], "welcome", 1)).toBeNull();
  });

  it("ignores a primary action that a control already handled", () => {
    expect(
      shouldIgnoreShellShortcut({
        shortcut: "primary-action",
        target: null,
        defaultPrevented: true,
        isComposing: false,
      }),
    ).toBe(true);
    expect(
      shouldIgnoreShellShortcut({
        shortcut: "primary-action-from-field",
        target: null,
        defaultPrevented: false,
        isComposing: true,
      }),
    ).toBe(true);
    expect(
      shouldIgnoreShellShortcut({
        shortcut: "close-tab",
        target: null,
        defaultPrevented: true,
        isComposing: false,
      }),
    ).toBe(false);
  });
});
