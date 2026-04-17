import { useState } from "react";
import { SearchInput } from "../../../ui/SearchInput";
import { DataTable } from "../../../ui/DataTable";
import { Spinner } from "../../../ui/Spinner";
import { useEntities, type EntityInfo } from "../../../../api/hooks/useEntities";

interface EntityListStepProps {
  onSelect: (entity: EntityInfo) => void;
  onBack: () => void;
}

export function EntityListStep({ onSelect, onBack }: EntityListStepProps) {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useEntities(true);

  const filtered = (data ?? []).filter(
    (e) =>
      e.logicalName.toLowerCase().includes(search.toLowerCase()) ||
      e.displayName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <div className="flex items-center justify-between gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search entities…"
        />
        <span className="text-xs text-[#858585] whitespace-nowrap">
          {filtered.length} {filtered.length === 1 ? "entity" : "entities"}
        </span>
      </div>

      {error && (
        <p className="text-sm text-[#f48771] bg-[#3c1e1e] border border-red-700 rounded-sm px-3 py-2">
          {(error as Error).message}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-[#858585] text-sm">
          <Spinner size={14} /> Loading entities…
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <DataTable<EntityInfo>
            columns={[
              {
                key: "displayName",
                header: "Display Name",
                render: (row) => (
                  <span className="font-medium text-white">{row.displayName}</span>
                ),
              },
              { key: "logicalName", header: "Logical Name", width: "220px" },
              {
                key: "isCustom",
                header: "Type",
                width: "80px",
                render: (row) => (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${row.isCustom ? "bg-[#1e2d3c] text-[#007fd4]" : "bg-[#2d2d2d] text-[#858585]"}`}>
                    {row.isCustom ? "Custom" : "System"}
                  </span>
                ),
              },
            ]}
            rows={filtered}
            getRowKey={(r) => r.logicalName}
            onRowClick={onSelect}
            emptyMessage={search ? "No entities match your search." : "No entities found."}
          />
        </div>
      )}

      <div className="flex justify-start pt-2">
        <button onClick={onBack} className="text-sm text-[#858585] hover:text-white transition-colors">
          ← Back
        </button>
      </div>
    </div>
  );
}
