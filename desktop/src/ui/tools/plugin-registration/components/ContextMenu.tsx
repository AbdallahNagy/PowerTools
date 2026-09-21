import { useEffect } from "react";
import type { NodeAction } from "../model/nodeActions";

interface ContextMenuProps {
  x: number;
  y: number;
  actions: NodeAction[];
  onSelect: (action: NodeAction) => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, actions, onSelect, onClose }: ContextMenuProps) {
  useEffect(() => {
    const close = () => onClose();
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [onClose]);

  return (
    <ul
      role="menu"
      className="fixed z-50 min-w-48 bg-[var(--color-bg-darker)] border border-[var(--color-border-dark)] rounded-sm py-1 shadow-lg"
      style={{ left: x, top: y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {actions.map((action) => (
        <li key={action.id}>
          <button
            type="button"
            role="menuitem"
            disabled={!!action.disabledReason}
            title={action.disabledReason}
            className="w-full text-left px-3 py-1.5 text-sm text-[var(--color-text-gray)] hover:bg-[var(--color-hover-bg)] disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              onSelect(action);
              onClose();
            }}
          >
            {action.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
