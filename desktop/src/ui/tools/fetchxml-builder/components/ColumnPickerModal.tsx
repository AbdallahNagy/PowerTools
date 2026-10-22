import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Modal, SearchInput } from "../../../shared/ui";
import { applyColumnSelection } from "../model/columns";
import type { FieldMetadata } from "../model/types";

interface ColumnPickerModalProps {
  open: boolean;
  fields: FieldMetadata[];
  columns: string[];
  onClose: () => void;
  onApply: (columns: string[]) => void;
}

export function ColumnPickerModal({ open, fields, columns, onClose, onApply }: ColumnPickerModalProps) {
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setChecked(columns);
  }, [columns, open]);

  const visibleFields = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...fields]
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .filter(
        (field) =>
          !term ||
          field.displayName.toLowerCase().includes(term) ||
          field.logicalName.toLowerCase().includes(term),
      );
  }, [fields, search]);

  const checkedSet = new Set(checked);

  function toggle(logicalName: string) {
    setChecked((prev) =>
      prev.includes(logicalName) ? prev.filter((name) => name !== logicalName) : [...prev, logicalName],
    );
  }

  return (
    <Modal open={open} title="Choose columns" onClose={onClose} widthClass="max-w-xl">
      <SearchInput value={search} onChange={setSearch} placeholder="Search columns" aria-label="Search columns" />

      <ul className="min-h-64 max-h-[52vh] overflow-auto border border-line rounded-sm" aria-label="Columns">
        {visibleFields.length === 0 ? (
          <li className="p-4 text-sm text-fg-muted">No columns match the search.</li>
        ) : (
          visibleFields.map((field) => {
            const id = `column-${field.logicalName}`;
            return (
              <li key={field.logicalName} className="border-b border-line last:border-0 hover:bg-hover">
                <label htmlFor={id} className="flex items-center gap-3 px-3 py-1.5 cursor-pointer text-xs">
                  <Checkbox
                    id={id}
                    checked={checkedSet.has(field.logicalName)}
                    onChange={() => toggle(field.logicalName)}
                  />
                  <span className="text-fg truncate">{field.displayName}</span>
                  <span className="text-fg-muted truncate ml-auto">{field.logicalName}</span>
                </label>
              </li>
            );
          })
        )}
      </ul>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-line">
        <span className="text-xs text-fg-muted">{checked.length} selected</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="text-xs py-1 px-3" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="text-xs py-1 px-3"
            onClick={() => onApply(applyColumnSelection(columns, checked))}
          >
            Apply
          </Button>
        </div>
      </div>
    </Modal>
  );
}
