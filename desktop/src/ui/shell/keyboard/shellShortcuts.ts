import { APP_MODAL_SELECTOR } from "../../shared/keyboard/appModal";

export type ShellShortcut =
  | "close-tab"
  | "next-tab"
  | "previous-tab"
  | "toggle-quick-open"
  | "toggle-sidebar"
  | "primary-action"
  | "primary-action-from-field";

export interface ShortcutKeyState {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function matchShellShortcut(event: ShortcutKeyState): ShellShortcut | null {
  if (event.altKey) return null;

  const command = event.ctrlKey || event.metaKey;
  if (command && event.key === "Tab") {
    return event.shiftKey ? "previous-tab" : "next-tab";
  }

  if (event.shiftKey) return null;

  const key = event.key.toLowerCase();
  if (command && key === "w") return "close-tab";
  if (command && key === "p") return "toggle-quick-open";
  if (command && key === "b") return "toggle-sidebar";
  if (command && event.key === "Enter") return "primary-action-from-field";
  if (!command && event.key === "Enter") return "primary-action";
  return null;
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
