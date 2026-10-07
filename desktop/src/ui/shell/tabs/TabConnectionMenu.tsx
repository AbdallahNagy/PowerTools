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
      className="fixed z-50 min-w-48 border border-line bg-raised py-1 text-sm text-fg"
      style={{ left: x, top: y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {listing ? (
        <>
          {connections.length === 0 && (
            <div className="px-3 py-1.5 text-fg-muted">No connections</div>
          )}
          {connections.map((connection) => {
            const selected = connection.name === connectionName;
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
              className="w-full px-3 py-1.5 text-left hover:bg-hover hover:text-fg-strong"
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
          className="w-full px-3 py-1.5 text-left hover:bg-hover hover:text-fg-strong"
          onClick={() => setListing(true)}
        >
          Change connection
        </button>
      )}
    </div>
  );
}
