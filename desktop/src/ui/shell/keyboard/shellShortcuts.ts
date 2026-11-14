import { APP_MODAL_SELECTOR } from "../../shared/keyboard/appModal";

export type ShellShortcut =
  | "close-tab"
  | "next-tab"
  | "previous-tab"
  | "move-tab-left"
  | "move-tab-right"
  | "toggle-quick-open"
  | "toggle-sidebar"
  | "open-settings"
  | "primary-action"
  | "primary-action-from-field";

export interface ShortcutKeyState {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** What Settings lists. Keep in step with matchShellShortcut. */
export const SHELL_SHORTCUT_LIST: ReadonlyArray<{ id: ShellShortcut; label: string; keys: string[] }> = [
  { id: "toggle-quick-open", label: "Open the command palette", keys: ["Ctrl+P"] },
  { id: "open-settings", label: "Open Settings", keys: ["Ctrl+,"] },
  { id: "toggle-sidebar", label: "Show or hide the sidebar", keys: ["Ctrl+B"] },
  { id: "close-tab", label: "Close the active tab", keys: ["Ctrl+W"] },
  { id: "next-tab", label: "Next tab", keys: ["Ctrl+Tab"] },
  { id: "previous-tab", label: "Previous tab", keys: ["Ctrl+Shift+Tab"] },
  { id: "move-tab-left", label: "Move the active tab left", keys: ["Ctrl+Shift+PageUp"] },
  { id: "move-tab-right", label: "Move the active tab right", keys: ["Ctrl+Shift+PageDown"] },
  { id: "primary-action", label: "Run the tool's main action", keys: ["Enter", "Ctrl+Enter in a field"] },
];

export function matchShellShortcut(event: ShortcutKeyState): ShellShortcut | null {
  if (event.altKey) return null;

  const command = event.ctrlKey || event.metaKey;
  if (command && event.key === "Tab") {
    return event.shiftKey ? "previous-tab" : "next-tab";
  }

  if (command && event.shiftKey && event.key === "PageUp") return "move-tab-left";
  if (command && event.shiftKey && event.key === "PageDown") return "move-tab-right";

  if (event.shiftKey) return null;

  if (command && (event.key === "," || event.code === "Comma")) return "open-settings";

  const key = shortcutLetter(event);
  if (command && key === "w") return "close-tab";
  if (command && key === "p") return "toggle-quick-open";
  if (command && key === "b") return "toggle-sidebar";
  if (command && event.key === "Enter") return "primary-action-from-field";
  if (!command && event.key === "Enter") return "primary-action";
  return null;
}

// Keyboard layouts that do not type Latin letters (Arabic, Hebrew, Russian, ...)
// report the typed character in `key`, so fall back to the physical key in
// `code`. Latin layouts keep using `key` so AZERTY and Dvorak stay correct.
function shortcutLetter(event: ShortcutKeyState): string {
  const key = event.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return key;
  const physical = /^Key([A-Z])$/.exec(event.code ?? "");
  return physical ? physical[1].toLowerCase() : key;
}

export function cycleTabId(
  tabIds: readonly string[],
  activeTabId: string,
  direction: 1 | -1,
): string | null {
  if (tabIds.length === 0) return null;

  const index = tabIds.indexOf(activeTabId);
  const start = index < 0 ? (direction === 1 ? -1 : 0) : index;
  const next = (start + direction + tabIds.length) % tabIds.length;
  return tabIds[next] ?? null;
}

function isHtmlElement(target: EventTarget | null): target is HTMLElement {
  return typeof HTMLElement !== "undefined" && target instanceof HTMLElement;
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!isHtmlElement(target)) return false;
  if (target.isContentEditable) return true;
  return target.closest("input, textarea, select, [contenteditable]") !== null;
}

export function isActivationTarget(target: EventTarget | null): boolean {
  if (!isHtmlElement(target)) return false;
  return target.closest("button, a, [role='button'], [role='link']") !== null;
}

export function isAppModalOpen(): boolean {
  return typeof document !== "undefined" && document.querySelector(APP_MODAL_SELECTOR) !== null;
}

export function shouldIgnoreShellShortcut(input: {
  shortcut: ShellShortcut;
  target: EventTarget | null;
  defaultPrevented: boolean;
  isComposing: boolean;
}): boolean {
  const primary =
    input.shortcut === "primary-action" || input.shortcut === "primary-action-from-field";
  if (primary && (input.defaultPrevented || input.isComposing)) return true;
  if (input.shortcut !== "primary-action") return false;
  return isTextEntryTarget(input.target) || isActivationTarget(input.target);
}
