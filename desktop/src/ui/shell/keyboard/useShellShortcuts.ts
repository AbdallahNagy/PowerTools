import { createContext, useCallback, useEffect } from "react";

import { useTabs } from "../tabs/useTabs";
import { usePrimaryActionRegistry } from "../../shared/keyboard";
import {
  cycleTabId,
  isAppModalOpen,
  matchShellShortcut,
  type ShellShortcut,
  shouldIgnoreShellShortcut,
} from "./shellShortcuts";

export interface ForwardedShortcutKeys {
  key: string;
  code?: string;
  ctrlKey: boolean;
  shiftKey: boolean;
}

/** Runs a shell shortcut from key state forwarded by a community tool frame. Null outside the shell. */
export const ShellShortcutDispatchContext = createContext<((keys: ForwardedShortcutKeys) => void) | null>(null);

const FORWARDABLE: ReadonlySet<string> = new Set([
  "close-tab",
  "next-tab",
  "previous-tab",
  "move-tab-left",
  "move-tab-right",
  "toggle-quick-open",
  "toggle-sidebar",
  "open-settings",
]);

interface ShellShortcutBindings {
  quickOpen: boolean;
  onQuickOpenChange: (open: boolean) => void;
  onToggleSidebar: () => void;
  onOpenSettings?: () => void;
}

export function useShellShortcuts({
  quickOpen,
  onQuickOpenChange,
  onToggleSidebar,
  onOpenSettings,
}: ShellShortcutBindings) {
  const { tabs, activeTabId, closeTab, setActiveTab, moveTab } = useTabs();
  const registry = usePrimaryActionRegistry();

  const runShellAction = useCallback(
    (shortcut: ShellShortcut) => {
      switch (shortcut) {
        case "close-tab":
          if (activeTabId) closeTab(activeTabId);
          break;
        case "next-tab":
        case "previous-tab": {
          const nextId = cycleTabId(
            tabs.map((tab) => tab.id),
            activeTabId,
            shortcut === "next-tab" ? 1 : -1,
          );
          if (nextId && nextId !== activeTabId) setActiveTab(nextId);
          break;
        }
        case "move-tab-left":
        case "move-tab-right": {
          const index = tabs.findIndex((tab) => tab.id === activeTabId);
          if (index >= 0) moveTab(activeTabId, index + (shortcut === "move-tab-right" ? 1 : -1));
          break;
        }
        case "toggle-quick-open":
          onQuickOpenChange(true);
          break;
        case "toggle-sidebar":
          onToggleSidebar();
          break;
        case "open-settings":
          onOpenSettings?.();
          break;
      }
    },
    [activeTabId, closeTab, moveTab, onOpenSettings, onQuickOpenChange, onToggleSidebar, setActiveTab, tabs],
  );

  const dispatchShortcut = useCallback(
    (keys: ForwardedShortcutKeys) => {
      const shortcut = matchShellShortcut({ ...keys, metaKey: false, altKey: false });
      if (!shortcut || !FORWARDABLE.has(shortcut)) return;
      if (isAppModalOpen()) return;
      if (quickOpen) {
        if (shortcut === "toggle-quick-open") onQuickOpenChange(false);
        return;
      }
      runShellAction(shortcut);
    },
    [onQuickOpenChange, quickOpen, runShellAction],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      const shortcut = matchShellShortcut(event);
      if (!shortcut) return;
      if (isAppModalOpen()) return;

      if (quickOpen) {
        if (shortcut === "toggle-quick-open") {
          event.preventDefault();
          onQuickOpenChange(false);
        }
        return;
      }

      if (
        shouldIgnoreShellShortcut({
          shortcut,
          target: event.target,
          defaultPrevented: event.defaultPrevented,
          isComposing: event.isComposing,
        })
      ) {
        return;
      }

      if (shortcut === "primary-action" || shortcut === "primary-action-from-field") {
        const action = registry?.get(activeTabId);
        if (!action?.enabled) return;
        event.preventDefault();
        action.run();
        return;
      }

      event.preventDefault();
      runShellAction(shortcut);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeTabId, onQuickOpenChange, quickOpen, registry, runShellAction]);

  return dispatchShortcut;
}
