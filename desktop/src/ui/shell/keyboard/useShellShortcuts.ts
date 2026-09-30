import { useEffect } from "react";

import { useTabs } from "../../context/useTabs";
import { usePrimaryActionRegistry } from "../../shared/keyboard";
import {
  cycleTabId,
  isAppModalOpen,
  matchShellShortcut,
  shouldIgnoreShellShortcut,
} from "./shellShortcuts";

interface ShellShortcutBindings {
  quickOpen: boolean;
  onQuickOpenChange: (open: boolean) => void;
  onToggleSidebar: () => void;
}

export function useShellShortcuts({
  quickOpen,
  onQuickOpenChange,
  onToggleSidebar,
}: ShellShortcutBindings) {
  const { tabs, activeTabId, closeTab, setActiveTab } = useTabs();
  const registry = usePrimaryActionRegistry();

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
        case "toggle-quick-open":
          onQuickOpenChange(true);
          break;
        case "toggle-sidebar":
          onToggleSidebar();
          break;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    activeTabId,
    closeTab,
    onQuickOpenChange,
    onToggleSidebar,
    quickOpen,
    registry,
    setActiveTab,
    tabs,
  ]);
}
