import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Modal, SearchInput, Spinner } from "../../../../shared/ui";
import type { EntityAttributeDto } from "../../model/contracts";

interface AttributePickerModalProps {
  open: boolean;
  title?: string;
  attributes: EntityAttributeDto[];
  selected: string[];
  isLoading?: boolean;
  onChange: (selected: string[]) => void;
  onClose: () => void;
}

export function AttributePickerModal({
  open,
  title = "Filtering attributes",
  attributes,
  selected,
  isLoading,
  onChange,
  onClose,
}: AttributePickerModalProps) {
  const [search, setSearch] = useState("");
  const checked = useMemo(() => new Set(selected), [selected]);
  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return attributes;
    return attributes.filter(
      (attribute) =>
        attribute.displayName.toLowerCase().includes(query) ||
        attribute.logicalName.toLowerCase().includes(query),
    );
  }, [attributes, query]);

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const toggle = (logicalName: string) => {
    if (checked.has(logicalName)) {
      onChange(selected.filter((name) => name !== logicalName));
    } else {
      onChange([...selected, logicalName]);
    }
  };

  const selectAllVisible = () => {
    const next = [...selected];
    const have = new Set(next);
    for (const attribute of filtered) {
      if (have.has(attribute.logicalName)) continue;
      next.push(attribute.logicalName);
      have.add(attribute.logicalName);
    }
    onChange(next);
  };

  const selectNoneVisible = () => {
    const visible = new Set(filtered.map((attribute) => attribute.logicalName));
    onChange(selected.filter((name) => !visible.has(name)));
  };

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((attribute) => checked.has(attribute.logicalName));
  const noneVisibleSelected = filtered.every(
    (attribute) => !checked.has(attribute.logicalName),
  );
  const selectionDisabled = Boolean(isLoading) || filtered.length === 0;

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      widthClass="max-w-lg"
      zClass="z-[60]"
      nested
    >
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search attributes…"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={selectAllVisible}
            disabled={selectionDisabled || allVisibleSelected}
            className="text-xs whitespace-nowrap text-[var(--color-primary)] hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={selectNoneVisible}
            disabled={selectionDisabled || noneVisibleSelected}
            className="text-xs whitespace-nowrap text-[var(--color-text-dark-gray)] hover:text-[var(--color-text-white)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Select none
          </button>
        </div>
        <span className="text-xs whitespace-nowrap text-[var(--color-text-dark-gray)]">
          {selected.length} selected
        </span>
      </div>
      <div className="max-h-72 min-h-40 overflow-auto border border-[var(--color-border-dark)] bg-[var(--color-bg-light)]">
        {isLoading ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-sm text-[var(--color-text-dark-gray)]">
            No attributes match the search.
          </p>
        ) : (
          filtered.map((attribute) => {
            const isChecked = checked.has(attribute.logicalName);
            return (
              <label
                key={attribute.logicalName}
                className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-sm text-[var(--color-text-gray)] hover:bg-[var(--color-hover-bg)]"
              >
                <Checkbox
                  checked={isChecked}
                  onChange={() => toggle(attribute.logicalName)}
                />
                <span>
                  {attribute.displayName}{" "}
                  <span className="text-[var(--color-text-dark-gray)]">
                    ({attribute.logicalName})
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
