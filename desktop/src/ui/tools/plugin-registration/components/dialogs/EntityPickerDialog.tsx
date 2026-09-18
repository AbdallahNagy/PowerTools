import { useEffect, useMemo, useState } from "react";

import { Button, Modal, Spinner } from "../../../../shared/ui";
import {
  entityDisplayName,
  entityLogicalName,
  entityOptionLabel,
  entitySearchText,
  type EntityPickerOption,
} from "../entityPickerModel";
import { fieldClass } from "../formStyles";

export function EntityPickerDialog({
  open,
  options,
  value,
  loading = false,
  onSelect,
  onClose,
}: {
  open: boolean;
  options: EntityPickerOption[];
  value: string;
  loading?: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return options;
    return options.filter((option) => entitySearchText(option).includes(term));
  }, [options, query]);

  if (!open) return null;

  const close = () => {
    setQuery("");
    onClose();
  };

  return (
    <Modal open title="Select entity" onClose={close} widthClass="max-w-3xl">
      <div role="dialog" aria-label="Select entity" className="flex flex-col gap-3">
        <input
          aria-label="Search entities"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search display name or logical name"
          className={fieldClass}
          autoFocus
        />
        {loading ? (
          <div role="status" className="flex items-center gap-2 text-sm text-[#858585]">
            <Spinner />
            Loading entity names…
          </div>
        ) : null}
        <div className="max-h-96 overflow-auto rounded-sm border border-[#3c3c3c]">
          <table className="w-full border-collapse text-sm text-[var(--color-text-gray)]">
            <thead className="sticky top-0 bg-[#252526]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[#858585]">Name</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[#858585]">Logical name</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-6 text-center text-xs text-[#858585]">No matching entities.</td>
                </tr>
              ) : filtered.map((option) => {
                const selected = option.id === value;
                return (
                  <tr key={option.id} className={selected ? "bg-[var(--color-hover-bg)]" : ""}>
                    <td colSpan={2} className="p-0">
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-label={entityOptionLabel(option)}
                        className="grid w-full grid-cols-2 px-3 py-2 text-left hover:bg-[var(--color-hover-bg)]"
                        onClick={() => {
                          onSelect(option.id);
                          close();
                        }}
                      >
                        <span className="truncate text-[var(--color-text-white)]">
                          {entityDisplayName(option)}{option.unavailable ? " (unavailable)" : ""}
                        </span>
                        <span className="truncate font-mono text-xs text-[#858585]">{entityLogicalName(option)}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
