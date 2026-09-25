import { useEffect, useRef, useState } from "react";

import { useConnections } from "../../shared/connections";

const ConnectionFooter = () => {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    activeConnectionName: activeName,
    connections,
    createConnectionWindow,
    deleteConnection: removeConnection,
    setActiveConnection,
  } = useConnections();

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setConfirmingDelete(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectConnection = async (name: string) => {
    await setActiveConnection(name);
    setOpen(false);
  };

  const deleteConnection = async (name: string) => {
    await removeConnection(name);
    setConfirmingDelete(null);
  };

  const addConnection = () => {
    createConnectionWindow();
    setOpen(false);
  };

  const label = activeName ?? "Not connected";

  return (
    <div
      className="relative shrink-0 border-t border-[var(--color-border-dark)] p-1"
      ref={containerRef}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={activeName ? `Connection: ${activeName}` : "Not connected"}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-[var(--color-text-gray)] hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-text-white)]"
        onClick={() => setOpen((current) => !current)}
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${
            activeName ? "bg-[var(--color-primary)]" : "bg-[var(--color-text-dark-gray)]"
          }`}
        />
        <span className="truncate">{label}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-1 right-1 z-50 mb-1 border border-[var(--color-border-dark)] bg-[var(--color-bg-light)] py-1 text-[var(--color-text-gray)]"
        >
          {connections.length === 0 && (
            <div className="px-3 py-1.5 text-[var(--color-text-dark-gray)]">No connections</div>
          )}

          {connections.map((connection) => {
            const isActive = connection.name === activeName;
            const isConfirming = confirmingDelete === connection.name;
            return (
              <div
                key={connection.name}
                className="group flex items-center justify-between hover:bg-[var(--color-hover-bg)]"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left"
                  onClick={() => {
                    if (!isConfirming) {
                      void selectConnection(connection.name);
                    }
                  }}
                >
                  <span className="inline-block w-3">{isActive ? "✓" : ""}</span>
                  <span className="truncate">{connection.name}</span>
                </button>

                {isConfirming ? (
                  <span className="flex shrink-0 items-center gap-1.5 pr-2">
                    <span>Delete?</span>
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => {
                        void deleteConnection(connection.name);
                      }}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => setConfirmingDelete(null)}
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    title="Delete connection"
                    aria-label={`Delete ${connection.name}`}
                    className="shrink-0 px-2 text-[var(--color-text-dark-gray)] hover:text-[var(--color-text-white)]"
                    onClick={() => setConfirmingDelete(connection.name)}
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}

          <div className="mt-1 border-t border-[var(--color-border-dark)] pt-1">
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-1 text-left hover:bg-[var(--color-hover-bg)]"
              onClick={addConnection}
            >
              Add connection
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectionFooter;
