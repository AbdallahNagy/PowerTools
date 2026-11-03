import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, DataTable, Modal, SearchInput } from "../../../shared/ui";
import type { ComponentTypeRow } from "../model/types";
import { filterComponentTypes } from "../model/view";
import { CopyRoute } from "./CopyRoute";
import { LabeledCheckbox } from "./LabeledCheckbox";

export function ComponentTypeModal({
  open,
  sourceNames,
  targetNames,
  types,
  loading,
  errorText,
  onCancel,
  onRetry,
  onCopy,
}: {
  open: boolean;
  /** Display names of the selected source solutions. */
  sourceNames: string[];
  /** Display names of the selected target solutions. */
  targetNames: string[];
  types: ComponentTypeRow[] | null;
  loading: boolean;
  errorText: string | null;
  onCancel: () => void;
  onRetry: () => void;
  onCopy: (componentTypes: number[], allComponents: boolean) => void;
}) {
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const [search, setSearch] = useState("");
  const [session, setSession] = useState(0);
  const appliedSession = useRef(0);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setSession((current) => current + 1);
      setSearch("");
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open || loading || errorText || types === null) return;
    if (appliedSession.current === session) return;
    appliedSession.current = session;
    setChecked(new Set(types.map((type) => type.componentType)));
  }, [errorText, loading, open, session, types]);

  const toggle = (componentType: number, value: boolean) => {
    setChecked((current) => {
      const next = new Set(current);
      if (value) next.add(componentType);
      else next.delete(componentType);
      return next;
    });
  };

  const listed = useMemo(() => types ?? [], [types]);
  const shown = useMemo(() => filterComponentTypes(listed, search), [listed, search]);
  // The header checkbox acts on the rows the search shows; hidden choices are kept.
  const allSelected = shown.length > 0 && shown.every((type) => checked.has(type.componentType));
  const someSelected = shown.some((type) => checked.has(type.componentType));
  const setAll = (selected: boolean) => {
    setChecked((current) => {
      const next = new Set(current);
      for (const type of shown) {
        if (selected) next.add(type.componentType);
        else next.delete(type.componentType);
      }
      return next;
    });
  };
  const selectedCount = listed.filter((type) => checked.has(type.componentType)).length;

  return (
    <Modal
      open={open}
      title="Component types"
      onClose={onCancel}
      busy={loading}
      busyLabel="Loading component types…"
    >
      <CopyRoute sourceNames={sourceNames} targetNames={targetNames} />
      {errorText ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-fg">{errorText}</p>
          <Button type="button" variant="secondary" onClick={onRetry}>Retry</Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-3">
            <SearchInput
              className="flex-1"
              value={search}
              onChange={setSearch}
              placeholder="Search component types"
              aria-label="Search component types"
            />
            <span className="shrink-0 text-xs text-fg-muted" aria-live="polite">
              {selectedCount} of {listed.length} selected
            </span>
          </div>
          <DataTable
            columns={[
              {
                key: "selected",
                width: "3rem",
                header: (
                  <label
                    className="inline-flex"
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      checked={allSelected}
                      indeterminate={!allSelected && someSelected}
                      disabled={loading || !!errorText || shown.length === 0}
                      onChange={setAll}
                    />
                    <span className="sr-only">Select all component types</span>
                  </label>
                ),
                render: (row: ComponentTypeRow) => (
                  <LabeledCheckbox
                    label={row.label}
                    checked={checked.has(row.componentType)}
                    onChange={(value) => toggle(row.componentType, value)}
                  />
                ),
              },
              { key: "label", header: "Component type", render: (row: ComponentTypeRow) => row.label },
            ]}
            rows={shown}
            getRowKey={(row) => String(row.componentType)}
            emptyMessage={listed.length === 0 ? "No component types" : "No matching component types"}
            layout="fixed"
            resizable={false}
          />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button
          type="button"
          disabled={loading || !!errorText || selectedCount === 0}
          onClick={() => onCopy(
            listed.filter((type) => checked.has(type.componentType)).map((type) => type.componentType),
            listed.length > 0 && selectedCount === listed.length,
          )}
        >
          Copy
        </Button>
      </div>
    </Modal>
  );
}
