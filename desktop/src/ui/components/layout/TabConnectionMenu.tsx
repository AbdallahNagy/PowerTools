import { useEffect, useState } from "react";

import { useConnections } from "../../shared/connections";

interface TabConnectionMenuProps {
  x: number;
  y: number;
  connectionName: string | null;
  onSelect: (connectionName: string) => void;
  onClose: () => void;
}

export default function TabConnectionMenu({
  x,
  y,
  connectionName,
  onSelect,
  onClose,
}: TabConnectionMenuProps) {
  const { connections, createConnectionWindow } = useConnections();
  const [listing, setListing] = useState(false);

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
      className="fixed z-50 min-w-48 border border-[var(--color-border-dark)] bg-[var(--color-bg-light)] py-1 text-sm text-[var(--color-text-gray)]"
      style={{ left: x, top: y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {listing ? (
        <>
          {connections.length === 0 && (
            <div className="px-3 py-1.5 text-[var(--color-text-dark-gray)]">No connections</div>
          )}
          {connections.map((connection) => {
            const selected = connection.name === connectionName;
            return (
              <button
                key={connection.name}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-white)]"
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
          <div className="mt-1 border-t border-[var(--color-border-dark)] pt-1">
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-1.5 text-left hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-white)]"
              onClick={() => {
                void createConnectionWindow();
                onClose();
              }}
            >
              Add connection
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          role="menuitem"
          className="w-full px-3 py-1.5 text-left hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-white)]"
          onClick={() => setListing(true)}
        >
          Change connection
        </button>
      )}
    </div>
  );
}
