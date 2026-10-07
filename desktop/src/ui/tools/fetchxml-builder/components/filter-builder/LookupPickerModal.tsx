import { useEffect, useMemo, useState } from "react";
import { Button, Field, Modal, SearchInput, Select, Spinner } from "../../../../shared/ui";
import type { EntityInfo } from "../../../../shared/contracts/dataverse";
import type { FieldMetadata } from "../../model/types";
import { useLookupRecords, type LookupRecord } from "../../hooks/useLookupRecords";
import { useFetchXmlBuilder } from "../../context/useFetchXmlBuilder";

export type SelectedLookupRecord = LookupRecord & { target: string };

const EMPTY_SELECTIONS: SelectedLookupRecord[] = [];

interface LookupPickerModalProps {
  open: boolean;
  mode: "single" | "multiple";
  field: FieldMetadata;
  targetOverride?: string;
  initialTarget?: string;
  selectedRecords?: SelectedLookupRecord[];
  onClose: () => void;
  onSelect?: (record: SelectedLookupRecord) => void;
  onApply?: (records: SelectedLookupRecord[]) => void;
}

export function LookupPickerModal({
  open,
  mode,
  field,
  targetOverride,
  initialTarget,
  selectedRecords = EMPTY_SELECTIONS,
  onClose,
  onSelect,
  onApply,
}: LookupPickerModalProps) {
  const { connectionName, tables } = useFetchXmlBuilder();
  const targetTables = useMemo(
    () => (targetOverride ? [targetOverride] : field.targets ?? [])
      .map((target) => tables.find((table) => table.logicalName === target))
      .filter((table): table is EntityInfo => !!table),
    [field.targets, tables, targetOverride],
  );
  const fallbackTarget = targetTables[0]?.logicalName ?? "";
  const [selectedTarget, setSelectedTarget] = useState(initialTarget ?? fallbackTarget);
  const [search, setSearch] = useState("");
  const [pendingSelections, setPendingSelections] = useState<Record<string, SelectedLookupRecord>>({});

  useEffect(() => {
    if (!open) return;
    setSelectedTarget(initialTarget ?? fallbackTarget);
    setSearch("");
    setPendingSelections(Object.fromEntries(selectedRecords.map((record) => [record.id, record])));
  }, [fallbackTarget, initialTarget, open, selectedRecords]);

  const selectedEntity = targetTables.find((table) => table.logicalName === selectedTarget) ?? null;
  const { data: records, isLoading, error } = useLookupRecords(connectionName, selectedEntity, search);
  const pendingCount = Object.keys(pendingSelections).length;

  function toggleRecord(record: LookupRecord) {
    if (!selectedEntity) return;

    setPendingSelections((prev) => {
      if (prev[record.id]) {
        const next = { ...prev };
        delete next[record.id];
        return next;
      }
      return {
        ...prev,
        [record.id]: { ...record, target: selectedEntity.logicalName },
      };
    });
  }

  return (
    <Modal
      open={open}
      title={`Select ${field.displayName}`}
      onClose={onClose}
      widthClass="max-w-3xl"
    >
      <div className="flex items-end gap-3 shrink-0">
        <Field label="Target Table" className="min-w-56">
          <Select
            value={selectedTarget}
            onChange={(e) => setSelectedTarget(e.target.value)}
            disabled={targetTables.length <= 1}
            className="[&>select]:bg-raised"
          >
            {targetTables.map((table) => (
              <option key={table.logicalName} value={table.logicalName}>
                {table.displayName} ({table.logicalName})
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex-1 min-w-64">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={selectedEntity ? `Search ${selectedEntity.displayName}...` : "Search..."}
          />
        </div>
      </div>

      <div className="min-h-64 max-h-[52vh] overflow-auto border border-line rounded-sm">
        {!selectedEntity ? (
          <div className="p-4 text-sm text-danger">
            No target table metadata is available for this lookup.
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-fg-muted">
            <Spinner size={16} /> Loading records...
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-danger">
            {(error as Error).message}
          </div>
        ) : records && records.length > 0 ? (
          <table className="w-full text-sm text-fg border-collapse">
            <thead className="bg-surface sticky top-0 z-10">
              <tr>
                {mode === "multiple" && (
                  <th className="px-3 py-2 w-8 border-b border-line" />
                )}
                <th className="text-left px-3 py-2 font-medium text-fg-muted text-xs tracking-wider border-b border-line">
                  Name
                </th>
                <th className="text-left px-3 py-2 font-medium text-fg-muted text-xs tracking-wider border-b border-line">
                  ID
                </th>
                <th className="text-left px-3 py-2 font-medium text-fg-muted text-xs tracking-wider border-b border-line">
                  Created On
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const selected = !!pendingSelections[record.id];
                return (
                <tr
                  key={record.id}
                  onClick={() => {
                    if (mode === "multiple") {
                      toggleRecord(record);
                      return;
                    }
                    onSelect?.({ ...record, target: selectedEntity.logicalName });
                  }}
                  className="border-b border-line last:border-0 hover:bg-hover cursor-pointer"
                >
                  {mode === "multiple" && (
                    <td className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleRecord(record)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-accent"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 text-xs max-w-sm truncate" title={record.name}>
                    {record.name}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs max-w-xs truncate text-fg-muted" title={record.id}>
                    {record.id}
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap text-fg-muted" title={record.createdOn ?? ""}>
                    {formatCreatedOn(record.createdOn)}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-4 text-sm text-fg-muted">
            No records found.
          </div>
        )}
      </div>

      {mode === "multiple" && (
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-line">
          <span className="text-xs text-fg-muted">
            {pendingCount} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="text-xs py-1 px-3" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="text-xs py-1 px-3"
              onClick={() => onApply?.(Object.values(pendingSelections))}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function formatCreatedOn(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
