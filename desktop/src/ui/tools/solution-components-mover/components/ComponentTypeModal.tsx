import { useEffect, useRef, useState } from "react";
import { Button, DataTable, Modal } from "../../../shared/ui";
import type { ComponentTypeRow } from "../model/types";
import { LabeledCheckbox } from "./LabeledCheckbox";

export function ComponentTypeModal({
  open,
  types,
  loading,
  errorText,
  onCancel,
  onRetry,
  onCopy,
}: {
  open: boolean;
  types: ComponentTypeRow[] | null;
  loading: boolean;
  errorText: string | null;
  onCancel: () => void;
  onRetry: () => void;
  onCopy: (componentTypes: number[], allComponents: boolean) => void;
}) {
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const [session, setSession] = useState(0);
  const appliedSession = useRef(0);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) setSession((current) => current + 1);
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

  return (
    <Modal
      open={open}
      title="Component types"
      onClose={onCancel}
      busy={loading}
      busyLabel="Loading component types…"
    >
      {errorText ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-[var(--color-text-gray)]">{errorText}</p>
          <Button type="button" variant="secondary" onClick={onRetry}>Retry</Button>
        </div>
      ) : (
        <DataTable
          columns={[
            {
              key: "selected",
              header: "Include",
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
          rows={types ?? []}
          getRowKey={(row) => String(row.componentType)}
          emptyMessage="No component types"
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={loading || !!errorText || !types || types.length === 0}
          onClick={() => setChecked(new Set((types ?? []).map((type) => type.componentType)))}
        >
          Select all
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={loading || !!errorText}
          onClick={() => setChecked(new Set())}
        >
          Clear all
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={loading || !!errorText || !types || types.length === 0}
          onClick={() => setChecked(new Set((types ?? []).filter((type) => !checked.has(type.componentType)).map((type) => type.componentType)))}
        >
          Invert
        </Button>
        <Button
          type="button"
          disabled={loading || !!errorText || checked.size === 0}
          onClick={() => onCopy(
            (types ?? []).filter((type) => checked.has(type.componentType)).map((type) => type.componentType),
            !!types && types.length > 0 && checked.size === types.length,
          )}
        >
          Copy
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </Modal>
  );
}
