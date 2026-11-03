import { useEffect, useRef, type ReactNode } from "react";
import { Alert, Button, EmptyState, Field, Input, Spinner, Textarea, Tooltip } from "../../../shared/ui";
import {
  definitionFormErrors,
  definitionFormOf,
  hasChanges,
  hasErrors,
  type DefinitionForm,
} from "../model/definitionForm";
import { definitionReadOnlyReason, valueReadOnlyReason, type EnvironmentVariable } from "../model/types";
import { draftError, isDirty, storedValue, type Drafts, type SaveResults } from "../model/view";
import { ValueField } from "./ValueField";

interface DetailsPanelProps {
  variable: EnvironmentVariable | null;
  drafts: Drafts;
  results: SaveResults;
  onDraftChange: (variable: EnvironmentVariable, value: string) => void;
  definitionForm: DefinitionForm | null;
  onDefinitionFormChange: (form: DefinitionForm) => void;
  /** Saves this variable's definition and current value together. */
  onSave: () => void;
  /** Drops this variable's unsaved definition and value edits. */
  onDiscard: () => void;
  saving: boolean;
  definitionError: string | null;
  onDeleteValue: () => void;
  onDeleteVariable: () => void;
  /** Disables every editor while changes are saving. */
  disabled: boolean;
  /** Changes when the value editor should take focus. */
  focusRequest: number;
}

const FOCUSABLE = "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable='true']";

function DisabledReason({ reason, children }: { reason: string | null; children: ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip content={reason}>
      <span tabIndex={0} className="inline-flex">
        {children}
      </span>
    </Tooltip>
  );
}

export function DetailsPanel({
  variable,
  drafts,
  results,
  onDraftChange,
  definitionForm,
  onDefinitionFormChange,
  onSave,
  onDiscard,
  saving,
  definitionError,
  onDeleteValue,
  onDeleteVariable,
  disabled,
  focusRequest,
}: DetailsPanelProps) {
  const valueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusRequest === 0) return;
    // The JSON editor loads on first use, so give it a frame before focusing.
    const frame = requestAnimationFrame(() => {
      valueRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  if (!variable) {
    return <EmptyState title="Select a variable to edit its value and definition." />;
  }

  const valueLocked = valueReadOnlyReason(variable);
  const value = drafts[variable.definitionId] ?? storedValue(variable);
  const valueError = draftError(variable, drafts);
  const result = results[variable.definitionId];
  const form = definitionForm ?? definitionFormOf(variable);
  const definitionLocked = definitionReadOnlyReason(variable);
  const formErrors = definitionFormErrors(variable.type, form);
  const definitionChanged = hasChanges(variable, definitionForm);
  const changed = definitionChanged || isDirty(variable, drafts);
  const invalid = (definitionChanged && hasErrors(formErrors)) || valueError !== null;
  const fieldsDisabled = disabled || definitionLocked !== null;
  const deleteVariableReason = variable.isManaged
    ? "This definition belongs to a managed solution. Only uninstalling or upgrading that solution removes it."
    : null;
  const deleteValueReason = variable.valueIsManaged
    ? "This value was imported with a managed solution. Only a solution upgrade that leaves it out removes it."
    : null;
  const usesDefault = variable.valueId === null && !isDirty(variable, drafts);

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Variable details">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
        {definitionLocked ? <Alert tone="info">{definitionLocked}</Alert> : null}
        <Field label="Display Name" error={definitionChanged ? formErrors.displayName : null}>
          <Input
            value={form.displayName}
            disabled={fieldsDisabled}
            onChange={(event) => onDefinitionFormChange({ ...form, displayName: event.target.value })}
          />
        </Field>
        <Field label="Schema Name" hint="Locked after creation">
          <Input className="font-mono" value={variable.schemaName} readOnly />
        </Field>
        <Field label="Type" hint="Locked after creation">
          <Input value={variable.typeLabel} readOnly />
        </Field>
        <Field label="Description" error={formErrors.description}>
          <Textarea
            rows={3}
            value={form.description}
            disabled={fieldsDisabled}
            onChange={(event) => onDefinitionFormChange({ ...form, description: event.target.value })}
          />
        </Field>
        <ValueField
          label="Default Value"
          type={variable.type}
          value={form.defaultValue}
          onChange={(next) => onDefinitionFormChange({ ...form, defaultValue: next })}
          error={formErrors.defaultValue}
          disabled={fieldsDisabled}
        />

        {variable.valueIsManaged ? (
          <Alert tone="warn">
            This value belongs to a managed solution. Saving changes it in this environment.
            {variable.managedValueSolutions.length > 0 ? ` Solution: ${variable.managedValueSolutions.join(", ")}.` : ""}
            {" "}A later import of a solution version that still carries a value can replace it.
          </Alert>
        ) : null}
        {valueLocked ? <Alert tone="info">{valueLocked}</Alert> : null}
        {variable.conflictingValues.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg-muted">Current Value</span>
            <ul className="flex flex-col gap-1 font-mono text-xs text-fg-muted" aria-label="Value rows">
              {variable.conflictingValues.map((row) => (
                <li key={row.valueId} className="break-all">
                  {row.value ?? ""}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ValueField
            ref={valueRef}
            label="Current Value"
            type={variable.type}
            value={value}
            onChange={(next) => onDraftChange(variable, next)}
            error={valueError}
            hint={usesDefault ? "No current value. Apps and flows use the default value." : undefined}
            disabled={disabled || valueLocked !== null}
          />
        )}
        {result && !result.ok ? <Alert tone="danger">{result.error ?? "The value could not be saved."}</Alert> : null}
        {definitionError ? <Alert tone="danger">{definitionError}</Alert> : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!changed || invalid || disabled} onClick={onSave}>
            {saving ? <Spinner size={12} /> : null}
            Save
          </Button>
          <Button variant="ghost" size="sm" disabled={!changed || disabled} onClick={onDiscard}>
            Discard
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {variable.valueId !== null ? (
            <DisabledReason reason={deleteValueReason}>
              <Button
                variant="secondary"
                size="sm"
                disabled={disabled || deleteValueReason !== null}
                onClick={onDeleteValue}
              >
                Delete Value
              </Button>
            </DisabledReason>
          ) : null}
          <DisabledReason reason={deleteVariableReason}>
            <Button
              variant="danger"
              size="sm"
              disabled={disabled || deleteVariableReason !== null}
              onClick={onDeleteVariable}
            >
              Delete Variable
            </Button>
          </DisabledReason>
        </div>
      </div>
    </section>
  );
}
