import { useState } from "react";
import { SearchInput } from "../../ui/SearchInput";
import { Spinner } from "../../ui/Spinner";
import { useTables } from "./hooks/useTables";
import type { EntityInfo } from "./model/types";
interface TableSelectorProps {
  connectionName: string | null;
  selected: EntityInfo | null;
  onSelect: (entity: EntityInfo) => void;
}

export function TableSelector({ connectionName, selected, onSelect }: TableSelectorProps) {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useTables(connectionName);

  const filtered = (data ?? []).filter(
    (e) =>
      e.logicalName.toLowerCase().includes(search.toLowerCase()) ||
      e.displayName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex items-center gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search tables…" />
        <span className="text-xs text-[#858585] whitespace-nowrap">{filtered.length}</span>
      </div>

      {error && (
        <p className="text-sm text-[#f48771] bg-[#3c1e1e] border border-red-700 rounded-sm px-3 py-2">
          {(error as Error).message}
        </p>
      )}

      {!connectionName ? (
        <p className="text-xs text-[#858585] italic mt-2">Select a connection first.</p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-[#858585] text-sm mt-2">
          <Spinner size={14} /> Loading tables…
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto border border-[#3c3c3c] rounded-sm">
          {filtered.map((e) => (
            <button
              key={e.logicalName}
              type="button"
              onClick={() => onSelect(e)}
              className={`w-full text-left px-3 py-1.5 border-b border-[#3c3c3c] last:border-0 transition-colors ${
                selected?.logicalName === e.logicalName ? "bg-[#1e2530]" : "hover:bg-[#2a2d2e]"
              }`}
            >
              <span className="text-sm text-[#cccccc] font-medium">{e.displayName}</span>
              <span className="ml-2 text-xs text-[#858585] font-mono">{e.logicalName}</span>
              {e.isCustom && (
                <span className="ml-2 text-xs px-1 py-0.5 rounded bg-[#1e2d3c] text-[#007fd4]">Custom</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-xs text-[#858585]">
              {search ? "No tables match your search." : "No tables found."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
