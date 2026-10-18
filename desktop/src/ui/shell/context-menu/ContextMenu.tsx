import { useEffect, type ReactNode } from "react";

import { useConnections } from "../../shared/connections";
import { ConnectionGroupList, ProductionBadge } from "../connections/ConnectionGroupList";

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
  selectedId: string | null;
  onSelect: (connectionId: string) => void;
  onClose: () => void;
}

/** Saved connections as menu items, grouped by organization, followed by "Add connection". */
export function ConnectionMenuItems({
  selectedId,
  onSelect,
  onClose,
}: ConnectionMenuItemsProps) {
  const { connections, createConnectionWindow } = useConnections();

  return (
    <>
      {connections.length === 0 && (
        <div className="px-3 py-1.5 text-fg-muted">No connections</div>
      )}
      <ConnectionGroupList
        connections={connections}
        renderRow={(connection, label) => {
          const selected = connection.id === selectedId;
          return (
            <button
              key={connection.id}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              aria-label={connection.displayName}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-hover hover:text-fg-strong"
              onClick={() => {
                onSelect(connection.id);
                onClose();
              }}
            >
              <span className="inline-block w-3">{selected ? "✓" : ""}</span>
              <span className="truncate">{label}</span>
              <ProductionBadge connection={connection} />
            </button>
          );
        }}
      />
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
