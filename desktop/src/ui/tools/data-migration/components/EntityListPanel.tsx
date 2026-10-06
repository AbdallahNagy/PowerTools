import { useState } from "react";
import { SearchInput, Spinner } from "../../../shared/ui";
import { useEntities } from "../api/useEntities";
import type { EntityInfo } from "../../../shared/contracts/dataverse";

interface EntityListPanelProps {
  connectionName: string | null;
  selected: EntityInfo | null;
  onSelect: (entity: EntityInfo) => void;
}

export function EntityListPanel({
  connectionName,
  selected,
  onSelect,
}: EntityListPanelProps) {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useEntities(connectionName);

  const filtered = (data ?? []).filter(
    (e) =>
      e.logicalName.toLowerCase().includes(search.toLowerCase()) ||
      e.displayName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex items-center justify-between gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search entities…"
        />
        <span className="text-xs text-fg-muted whitespace-nowrap">
          {filtered.length}
        </span>
      </div>

      {error && (
        <p className="text-sm text-danger bg-danger-soft border border-danger rounded-sm px-3 py-2">
          {(error as Error).message}
        </p>
      )}

      {!connectionName ? (
        <p className="text-xs text-fg-muted italic mt-2">
          Select a source connection.
        </p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-fg-muted text-sm mt-2">
          <Spinner size={14} /> Loading entities…
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto border border-line rounded-sm">
          {filtered.map((e) => (
            <button
              key={e.logicalName}
              type="button"
              onClick={() => onSelect(e)}
              className={`w-full text-left px-3 py-1.5 border-b border-line last:border-0 transition-colors ${
                selected?.logicalName === e.logicalName
                  ? "bg-accent-soft"
                  : "hover:bg-hover"
              }`}
            >
              <span className="text-sm text-fg font-medium">
                {e.displayName}
              </span>
              <span className="ml-2 text-xs text-fg-muted font-mono">
                {e.logicalName}
              </span>
              {e.isCustom && (
                <span className="ml-2 text-xs px-1 py-0.5 rounded bg-accent-soft text-accent-text">
                  Custom
                </span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-xs text-fg-muted">
              {search ? "No entities match your search." : "No entities found."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
