import { useMemo, useState } from "react";

import { Button, Modal, Spinner } from "../../../../shared/ui";
import type { StepFilterAttribute } from "../../api/useStepMutations";
import { fieldClass } from "../formStyles";

export function AttributePickerDialog({
  open,
  attributes,
  selected,
  loading = false,
  disabled = false,
  onChange,
  onClose,
}: {
  open: boolean;
  attributes: StepFilterAttribute[];
  selected: string[];
  loading?: boolean;
  disabled?: boolean;
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = new Set(selected.map((value) => value.toLowerCase()));
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return attributes;
    return attributes.filter((attribute) => attributeSearchText(attribute).includes(term));
  }, [attributes, query]);

  if (!open) return null;

  const selectVisible = () => {
    const next = new Set(selectedSet);
    for (const attribute of filtered) {
      if (!attribute.isPrimaryId) next.add(attribute.logicalName.toLowerCase());
    }
    onChange([...next]);
  };
  const clearVisible = () => {
    const visible = new Set(filtered.map((attribute) => attribute.logicalName.toLowerCase()));
    onChange(selected.filter((value) => !visible.has(value.toLowerCase())));
  };

  return (
    <Modal open title="Select filtering attributes" onClose={() => { setQuery(""); onClose(); }} widthClass="max-w-3xl">
      <div role="dialog" aria-label="Select filtering attributes" className="flex flex-col gap-3">
        <input
          aria-label="Search attributes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search display name, logical name, or type"
          className={fieldClass}
          autoFocus
        />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={disabled || loading || filtered.length === 0} onClick={selectVisible}>
            Select all
          </Button>
          <Button type="button" variant="secondary" disabled={disabled || loading || selected.length === 0} onClick={clearVisible}>
            Select none
          </Button>
        </div>
        {loading ? (
          <div role="status" className="flex min-h-40 items-center justify-center gap-2 text-sm text-[#858585]">
            <Spinner />
            Loading attributes…
          </div>
        ) : (
          <div className="max-h-96 overflow-auto rounded-sm border border-[#3c3c3c]">
            <table className="w-full border-collapse text-sm text-[var(--color-text-gray)]">
              <thead className="sticky top-0 bg-[#252526]">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[#858585]">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[#858585]">Logical name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-[#858585]">Type</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-xs text-[#858585]">No matching attributes.</td>
                  </tr>
                ) : filtered.map((attribute) => {
                  const id = attribute.logicalName.toLowerCase();
                  const checked = selectedSet.has(id);
                  return (
                    <tr key={id} className="border-t border-[#3c3c3c] hover:bg-[var(--color-hover-bg)]">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={attribute.logicalName}
                          checked={checked}
                          disabled={disabled}
                          onChange={() => {
                            onChange(checked ? selected.filter((value) => value.toLowerCase() !== id) : [...selected, id]);
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text-white)]">{attribute.displayName || attribute.logicalName}</td>
                      <td className="px-3 py-2 font-mono text-xs text-[#858585]">{attribute.logicalName}</td>
                      <td className="px-3 py-2 text-[#858585]">{attribute.attributeType || "Unknown"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end">
          <Button type="button" onClick={() => { setQuery(""); onClose(); }}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}

function attributeSearchText(attribute: StepFilterAttribute) {
  return `${attribute.displayName} ${attribute.logicalName} ${attribute.attributeType}`.toLocaleLowerCase();
}
