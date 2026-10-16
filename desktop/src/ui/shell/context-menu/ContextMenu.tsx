import { useEffect, type ReactNode } from "react";

import { useConnections } from "../../shared/connections";

export const contextMenuItemClassName =
  "w-full px-3 py-1.5 text-left hover:bg-hover hover:text-fg-strong disabled:text-fg-muted disabled:hover:bg-transparent";

interface ContextMenuProps {
  x: number;
  y: number;
  label?: string;
  onClose: () => void;
  children: ReactNode;
}

/** Menu at the pointer that closes on an outside click or Escape. */
export function ContextMenu({ x, y, label, onClose, children }: ContextMenuProps) {
  useEffect(() => {
    const closeOnPointer = () => onClose();
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", closeOnPointer);
    document.addEventListener("keydown", closeOnKey);
    return () => {
      document.removeEventListener("mousedown", closeOnPointer);
      document.removeEventListener("keydown", closeOnKey);
    };
  }, [onClose]);

  return (
    <div
      role="menu"
      aria-label={label}
      className="fixed z-50 min-w-48 border border-line bg-raised py-1 text-sm text-fg"
      style={{ left: x, top: y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

interface ConnectionMenuItemsProps {
  /** Connection to show as checked, if any. */
  selectedName: string | null;
  onSelect: (connectionName: string) => void;
  onClose: () => void;
}

/** Saved connections as menu items, followed by "Add connection". */
export function ConnectionMenuItems({
  selectedName,
  onSelect,
  onClose,
}: ConnectionMenuItemsProps) {
  const { connections, createConnectionWindow } = useConnections();

  return (
    <>
      {connections.length === 0 && (
        <div className="px-3 py-1.5 text-fg-muted">No connections</div>
      )}
      {connections.map((connection) => {
        const selected = connection.name === selectedName;
        return (
          <button
            key={connection.name}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-hover hover:text-fg-strong"
            onClick={() => {
              onSelect(connection.name);
              onClose();
            }}
          >
            <span className="inline-block w-3">{selected ? "✓" : ""}</span>
            <span className="truncate">{connection.name}</span>
          </button>
        );
      })}
      <div className="mt-1 border-t border-line pt-1">
        <button
          type="button"
          role="menuitem"
          className={contextMenuItemClassName}
          onClick={() => {
            void createConnectionWindow();
            onClose();
          }}
        >
          Add connection
        </button>
      </div>
    </>
  );
}
