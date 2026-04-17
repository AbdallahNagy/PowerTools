import { useEffect, useState } from "react";
import { Checkbox } from "../../../ui/Checkbox";
import { SearchInput } from "../../../ui/SearchInput";
import { Spinner } from "../../../ui/Spinner";
import { Button } from "../../../ui/Button";
import { useEntityAttributes, type AttributeInfo } from "../../../../api/hooks/useEntityAttributes";

interface AttributeSelectStepProps {
  entityLogicalName: string;
  selectedAttributes: string[];
  onNext: (attributes: string[]) => void;
  onBack: () => void;
}

export function AttributeSelectStep({
  entityLogicalName,
  selectedAttributes,
  onNext,
  onBack,
}: AttributeSelectStepProps) {
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set(selectedAttributes));
  const { data, isLoading, error } = useEntityAttributes(entityLogicalName);

  const usable = (data ?? []).filter(
    (a) => a.isValidForCreate || a.isValidForUpdate
  );

  const filtered = usable.filter(
    (a) =>
      a.logicalName.toLowerCase().includes(search.toLowerCase()) ||
      a.displayName.toLowerCase().includes(search.toLowerCase())
  );

  // Ensure primary ids are always checked
  useEffect(() => {
    if (!data) return;
    const pks = data.filter((a) => a.isPrimaryId).map((a) => a.logicalName);
    setChecked((prev) => {
      const next = new Set(prev);
      pks.forEach((pk) => next.add(pk));
      return next;
    });
  }, [data]);

  const toggle = (logicalName: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(logicalName)) next.delete(logicalName);
      else next.add(logicalName);
      return next;
    });
  };

  const selectAll = () => setChecked(new Set(usable.map((a) => a.logicalName)));
  const selectNone = () => {
    const pks = new Set((data ?? []).filter((a) => a.isPrimaryId).map((a) => a.logicalName));
    setChecked(pks);
  };

  const reqColors: Record<string, string> = {
    SystemRequired: "bg-[#3c2020] text-[#f48771]",
    ApplicationRequired: "bg-[#3c2d20] text-[#e8a87c]",
    Recommended: "bg-[#1e2d1e] text-[#73c991]",
    None: "bg-[#2d2d2d] text-[#858585]",
  };

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <div className="flex items-center justify-between">
        <SearchInput value={search} onChange={setSearch} placeholder="Search attributes…" />
        <div className="flex gap-2 ml-4">
          <button onClick={selectAll} className="text-xs text-[#007fd4] hover:underline whitespace-nowrap">Select all</button>
          <button onClick={selectNone} className="text-xs text-[#858585] hover:text-white whitespace-nowrap">Select none</button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-[#f48771] bg-[#3c1e1e] border border-red-700 rounded-sm px-3 py-2">
          {(error as Error).message}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-[#858585] text-sm">
          <Spinner size={14} /> Loading attributes…
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto border border-[#3c3c3c] rounded-sm">
          <table className="w-full text-sm">
            <thead className="bg-[#252526] sticky top-0">
              <tr>
                <th className="w-10 px-3 py-2" />
                <th className="text-left px-3 py-2 text-xs font-medium text-[#858585] uppercase">Display Name</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-[#858585] uppercase">Logical Name</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-[#858585] uppercase">Type</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-[#858585] uppercase">Required</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((attr) => {
                const isLocked = attr.isPrimaryId;
                const isChecked = checked.has(attr.logicalName);
                return (
                  <tr
                    key={attr.logicalName}
                    onClick={() => !isLocked && toggle(attr.logicalName)}
                    className={`border-b border-[#3c3c3c] last:border-0 transition-colors ${
                      isLocked ? "opacity-60" : "cursor-pointer hover:bg-[#2a2d2e]"
                    } ${isChecked ? "bg-[#1e2530]" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={isChecked}
                        onChange={() => !isLocked && toggle(attr.logicalName)}
                        disabled={isLocked}
                      />
                    </td>
                    <td className="px-3 py-2 text-[#cccccc] font-medium">{attr.displayName}</td>
                    <td className="px-3 py-2 text-[#858585] font-mono text-xs">{attr.logicalName}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs bg-[#2d2d2d] text-[#858585] px-1.5 py-0.5 rounded">
                        {attr.attributeType}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${reqColors[attr.requiredLevel] ?? reqColors.None}`}>
                        {attr.requiredLevel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between items-center pt-2">
        <button onClick={onBack} className="text-sm text-[#858585] hover:text-white transition-colors">
          ← Back
        </button>
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#858585]">{checked.size} selected</span>
          <Button disabled={checked.size === 0} onClick={() => onNext(Array.from(checked))}>
            Next →
          </Button>
        </div>
      </div>
    </div>
  );
}
