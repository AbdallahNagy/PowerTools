import { useEffect, useRef, useState } from "react";
import type { ConnectionInfo } from "../../vite-env";
import { useStatusBar } from "../../context/StatusBarContext";

const StatusBar = () => {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { items } = useStatusBar();

  useEffect(() => {
    window.electron.listConnections().then(setConnections);

    window.electron.getActiveConnection().then((res) => {
      if ("name" in res) setActiveName(res.name);
    });

    window.electron.onConnectionStatusUpdate((name) => setActiveName(name));
    window.electron.onConnectionsUpdated((list) => setConnections(list));
  }, []);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setConfirmingDelete(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectConnection = async (name: string) => {
    await window.electron.setActiveConnection(name);
    setActiveName(name);
    setOpen(false);
  };

  const deleteConnection = async (name: string) => {
    await window.electron.deleteConnection(name);
    setConfirmingDelete(null);
  };

  const addConnection = () => {
    window.electron.createConnectionWindow();
    setOpen(false);
  };

  return (
    <div className="h-6 bg-(--blue-color) flex items-center justify-between px-2 text-white text-xs select-none">
      <div className="relative flex items-center space-x-2" ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="hover:bg-white/15 px-1 rounded cursor-pointer"
        >
          {activeName ? `Connected: (${activeName})` : "Not Connected"}
        </button>

        {open && (
          <div className="absolute bottom-full left-0 mb-1 min-w-56 bg-[#252526] text-[#cccccc] border border-black/40 rounded shadow-lg py-1 z-50">
            {connections.length === 0 && (
              <div className="px-3 py-1.5 text-[#888]">No connections</div>
            )}

            {connections.map((c) => {
              const isActive = c.name === activeName;
              const isConfirming = confirmingDelete === c.name;
              return (
                <div
                  key={c.name}
                  className="group flex items-center justify-between px-2 py-1 hover:bg-white/10 cursor-pointer"
                  onClick={() => !isConfirming && selectConnection(c.name)}
                >
                  <span className="flex items-center gap-1 truncate">
                    <span className="w-3 inline-block">{isActive ? "✓" : ""}</span>
                    <span className="truncate">{c.name}</span>
                  </span>

                  {isConfirming ? (
                    <span
                      className="flex items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[#f48771]">Delete?</span>
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => deleteConnection(c.name)}
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
                      className="opacity-0 group-hover:opacity-100 hover:text-[#f48771] shrink-0 px-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingDelete(c.name);
                      }}
                    >
                      🗑
                    </button>
                  )}
                </div>
              );
            })}

            <div className="border-t border-black/40 mt-1 pt-1">
              <button
                type="button"
                className="w-full text-left px-3 py-1 hover:bg-white/10"
                onClick={addConnection}
              >
                + Add connection
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center">
            {item.content}
          </div>
        ))}
        <span>v1.0.0</span>
      </div>
      
    </div>
  );
};

export default StatusBar;
