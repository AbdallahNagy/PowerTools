import { useEffect, useRef, useState } from "react";

import { useConnections } from "../../shared/connections";
import { ConnectionGroupList, ProductionBadge } from "../connections/ConnectionGroupList";

const ConnectionFooter = () => {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    activeConnectionId: activeId,
    connections,
    createConnectionWindow,
    openConnectionManager,
    deleteConnection: removeConnection,
    setActiveConnection,
  } = useConnections();
  const active = connections.find((connection) => connection.id === activeId) ?? null;
  const firstUngrouped = connections.find((connection) => connection.isUngrouped) ?? null;

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

  const selectConnection = async (id: string) => {
    await setActiveConnection(id);
    setOpen(false);
  };

  const deleteConnection = async (id: string) => {
    await removeConnection(id);
    setConfirmingDelete(null);
  };

  const addConnection = () => {
    createConnectionWindow();
    setOpen(false);
  };

  const manage = (id?: string | null) => {
    void openConnectionManager(id);
    setOpen(false);
  };

  const label = active?.displayName ?? "Not connected";

  return (
    <div
      className="relative shrink-0 border-t border-line p-1"
      ref={containerRef}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={active ? `Connection: ${active.displayName}` : "Not connected"}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-fg hover:bg-hover hover:text-fg-strong"
        onClick={() => setOpen((current) => !current)}
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${
            active ? "bg-accent" : "bg-fg-muted"
          }`}
        />
        <span className="truncate">{label}</span>
        {active ? <ProductionBadge connection={active} /> : null}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-1 right-1 z-50 mb-1 max-h-[70vh] overflow-y-auto border border-line bg-raised py-1 text-fg"
        >
          {connections.length === 0 && (
            <div className="px-3 py-1.5 text-fg-muted">No connections</div>
          )}

          <ConnectionGroupList
            connections={connections}
            ungroupedHint={
              <button
                type="button"
                className="truncate text-accent-text hover:underline"
                onClick={() => manage(firstUngrouped?.id)}
              >
                Update these to group them
              </button>
            }
            renderRow={(connection, rowLabel) => {
              const isActive = connection.id === activeId;
              const isConfirming = confirmingDelete === connection.id;
              return (
                <div
                  key={connection.id}
                  className="group flex items-center justify-between hover:bg-hover"
                >
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={connection.displayName}
                    className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left"
                    onClick={() => {
                      if (!isConfirming) {
                        void selectConnection(connection.id);
                      }
                    }}
                  >
                    <span className="inline-block w-3 shrink-0">{isActive ? "✓" : ""}</span>
                    <span className="truncate">{rowLabel}</span>
                    <ProductionBadge connection={connection} />
                  </button>

                  {isConfirming ? (
                    <span className="flex shrink-0 items-center gap-1.5 pr-2">
                      <span>Delete?</span>
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => {
                          void deleteConnection(connection.id);
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
                    <span className="flex shrink-0 items-center">
                      <button
                        type="button"
                        title={connection.isUngrouped ? "Add an organization and environment" : "Edit connection"}
                        aria-label={`${connection.isUngrouped ? "Update" : "Edit"} ${connection.displayName}`}
                        className={`px-2 text-fg-muted hover:text-fg-strong ${
                          connection.isUngrouped ? "" : "invisible group-hover:visible group-focus-within:visible"
                        }`}
                        onClick={() => manage(connection.id)}
                      >
                        {connection.isUngrouped ? "Update" : "Edit"}
                      </button>
                      <button
                        type="button"
                        title="Delete connection"
                        aria-label={`Delete ${connection.displayName}`}
                        className="px-2 text-fg-muted hover:text-fg-strong"
                        onClick={() => setConfirmingDelete(connection.id)}
                      >
                        Delete
                      </button>
                    </span>
                  )}
                </div>
              );
            }}
          />

          <div className="mt-1 border-t border-line pt-1">
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-1 text-left hover:bg-hover"
              onClick={addConnection}
            >
              Add connection
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-1 text-left hover:bg-hover"
              onClick={() => manage()}
            >
              Manage connections…
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectionFooter;
