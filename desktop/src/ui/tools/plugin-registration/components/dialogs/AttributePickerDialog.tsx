import { useMemo, useState } from "react";

import { Button, Modal, Spinner } from "../../../../shared/ui";
import type { StepFilterAttribute } from "../../api/useStepMutations";
import { fieldClass } from "../formStyles";

const PRIMARY_KEY_UPDATE_FILTER_REASON =
  "The primary key cannot filter Update steps because the record ID never changes.";

export function AttributePickerDialog({
  open,
  attributes,
  selected,
  loading = false,
  disabled = false,
  blockPrimaryId = false,
  onChange,
  onClose,
}: {
  open: boolean;
  attributes: StepFilterAttribute[];
  selected: string[];
  loading?: boolean;
  disabled?: boolean;
  blockPrimaryId?: boolean;
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
  const toggleAttribute = (attribute: StepFilterAttribute) => {
    const id = attribute.logicalName.toLowerCase();
    const checked = selectedSet.has(id);
    if (disabled || (attribute.isPrimaryId && blockPrimaryId && !checked)) return;
    onChange(checked ? selected.filter((value) => value.toLowerCase() !== id) : [...selected, id]);
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
                  const blocked = Boolean(attribute.isPrimaryId && blockPrimaryId && !checked);
                  return (
                    <tr key={id} className="border-t border-[#3c3c3c]">
                      <td colSpan={4} className="p-0">
                        <label
                          className={`grid w-full grid-cols-[2.5rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,8rem)] items-start px-3 py-2 ${
                            blocked || disabled
                              ? "cursor-not-allowed opacity-70"
                              : "cursor-pointer hover:bg-[var(--color-hover-bg)]"
                          }`}
                          title={blocked ? PRIMARY_KEY_UPDATE_FILTER_REASON : undefined}
                        >
                          <input
                            type="checkbox"
                            aria-label={attribute.logicalName}
                            className="mt-0.5"
                            checked={checked}
                            disabled={disabled || blocked}
                            onChange={() => toggleAttribute(attribute)}
                          />
                          <span className="min-w-0 text-[var(--color-text-white)]">
                            <span className="block truncate">{attribute.displayName || attribute.logicalName}</span>
                            {blocked ? (
                              <span className="mt-0.5 block text-[11px] leading-4 text-[#858585]">
                                {PRIMARY_KEY_UPDATE_FILTER_REASON}
                              </span>
                            ) : null}
                          </span>
                          <span className="truncate font-mono text-xs text-[#858585]">{attribute.logicalName}</span>
                          <span className="truncate text-[#858585]">{attribute.attributeType || "Unknown"}</span>
                        </label>
                      </td>
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
