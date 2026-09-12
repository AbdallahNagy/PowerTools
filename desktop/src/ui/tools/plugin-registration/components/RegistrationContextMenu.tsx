import { useEffect, useRef } from "react";

import type { CatalogTreeNode } from "../model/catalogTree";
import {
  registrationActionsForNode,
  type RegistrationActionIntent,
} from "../model/registrationActions";

export interface RegistrationContextMenuState {
  node: CatalogTreeNode;
  x: number;
  y: number;
  anchor: HTMLButtonElement;
}

interface RegistrationContextMenuProps {
  state: RegistrationContextMenuState | null;
  onAction: (intent: RegistrationActionIntent) => void;
  onClose: () => void;
}

export function RegistrationContextMenu({ state, onAction, onClose }: RegistrationContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();

    const dismissOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      state.anchor.focus();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [onClose, state]);

  if (!state) return null;

  const items = registrationActionsForNode(state.node);
  const left = Math.min(Math.max(8, state.x), Math.max(8, window.innerWidth - 232));
  const estimatedHeight = items.length * 32 + 16;
  const top = Math.min(Math.max(8, state.y), Math.max(8, window.innerHeight - estimatedHeight));

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${state.node.label} actions`}
      className="fixed z-40 w-56 py-1 bg-[#252526] border border-[#555] rounded-sm shadow-xl"
      style={{ left, top }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className="w-full px-3 py-1.5 text-left text-sm text-[#cccccc] hover:bg-[#094771] hover:text-white focus:outline-none focus:bg-[#094771] focus:text-white"
          onClick={() => {
            onAction(item.intent);
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
