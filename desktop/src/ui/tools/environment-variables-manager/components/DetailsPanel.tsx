import { useEffect, useRef, type ReactNode } from "react";
import { Alert, Button, EmptyState, Field, Input, Spinner, Textarea, Tooltip } from "../../../shared/ui";
import {
  definitionFormErrors,
  definitionFormOf,
  hasChanges,
  hasErrors,
  type DefinitionForm,
} from "../model/definitionForm";
import { definitionReadOnlyReason, valueKind, valueReadOnlyReason, type EnvironmentVariable } from "../model/types";
import { draftError, storedValue, type Drafts, type SaveResults } from "../model/view";
import { ValueEditor } from "./ValueEditor";

interface DetailsPanelProps {
  variable: EnvironmentVariable | null;
  drafts: Drafts;
  results: SaveResults;
  onDraftChange: (variable: EnvironmentVariable, value: string) => void;
  definitionForm: DefinitionForm | null;
  onDefinitionFormChange: (form: DefinitionForm) => void;
  onSaveDefinition: () => void;
  savingDefinition: boolean;
  definitionError: string | null;
  onDeleteValue: () => void;
  onDeleteVariable: () => void;
  /** Disables every editor while value edits are saving. */
  disabled: boolean;
  /** Changes when the value editor should take focus. */
  focusRequest: number;
}

const FOCUSABLE = "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable='true']";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{title}</h3>
      {children}
    </section>
  );
}

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
  onSaveDefinition,
  savingDefinition,
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

  const kind = valueKind(variable.type);
  const valueLocked = valueReadOnlyReason(variable);
  const value = drafts[variable.definitionId] ?? storedValue(variable);
  const valueError = draftError(variable, drafts);
  const result = results[variable.definitionId];
  const form = definitionForm ?? definitionFormOf(variable);
  const definitionLocked = definitionReadOnlyReason(variable);
  const formErrors = definitionFormErrors(variable.type, form);
  const changed = hasChanges(variable, definitionForm);
  const fieldsDisabled = disabled || savingDefinition || definitionLocked !== null;
  const deleteVariableReason = variable.isManaged
    ? "This definition belongs to a managed solution. Only uninstalling or upgrading that solution removes it."
    : null;
  const deleteValueReason = variable.valueIsManaged
    ? "This value was imported with a managed solution. Only a solution upgrade that leaves it out removes it."
    : null;
  const valueLabel = kind === "json" ? "Current Value (JSON)" : "Current Value";
  const defaultPlaceholder = variable.valueId === null ? (variable.defaultValue ?? "") : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-auto p-4">
      <Section title="Current value">
        {variable.valueIsManaged ? (
          <Alert tone="warn">
            This value belongs to a managed solution. Saving changes it in this environment.
            {variable.managedValueSolutions.length > 0 ? ` Solution: ${variable.managedValueSolutions.join(", ")}.` : ""}
            {" "}A later import of a solution version that still carries a value can replace it.
          </Alert>
        ) : null}
        {valueLocked ? <Alert tone="info">{valueLocked}</Alert> : null}
        {variable.conflictingValues.length > 0 ? (
          <ul className="flex flex-col gap-1 font-mono text-xs text-fg-muted" aria-label="Value rows">
            {variable.conflictingValues.map((row) => (
              <li key={row.valueId} className="break-all">
                {row.value ?? ""}
              </li>
            ))}
          </ul>
        ) : (
          <div ref={valueRef}>
            {kind === "secret" ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-fg-muted">{valueLabel}</span>
                <ValueEditor
                  type={variable.type}
                  value={value}
                  onChange={(next) => onDraftChange(variable, next)}
                  disabled={disabled || valueLocked !== null}
                  aria-label={valueLabel}
                />
                {valueError ? <p className="text-xs text-danger">{valueError}</p> : null}
              </div>
            ) : (
              <Field
                label={valueLabel}
                error={valueError}
                hint={variable.valueId === null && variable.defaultValue ? "Default value applies until you save one." : undefined}
              >
                <ValueEditor
                  type={variable.type}
                  value={value}
                  onChange={(next) => onDraftChange(variable, next)}
                  invalid={valueError !== null}
                  disabled={disabled || valueLocked !== null}
                  placeholder={defaultPlaceholder}
                  aria-label={valueLabel}
                />
              </Field>
            )}
          </div>
        )}
        {variable.valueId !== null ? (
          <div>
            <DisabledReason reason={deleteValueReason}>
              <Button
                variant="danger"
                size="sm"
                disabled={disabled || deleteValueReason !== null}
                onClick={onDeleteValue}
              >
                Delete Value
              </Button>
            </DisabledReason>
          </div>
        ) : null}
        {result && !result.ok ? <Alert tone="danger">{result.error ?? "The value could not be saved."}</Alert> : null}
      </Section>

      <Section title="Definition">
        {definitionLocked ? <Alert tone="info">{definitionLocked}</Alert> : null}
        <Field label="Display Name" error={changed ? formErrors.displayName : null}>
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
        {kind === "secret" ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg-muted">Default Value</span>
            <ValueEditor
              type={variable.type}
              value={form.defaultValue}
              onChange={(next) => onDefinitionFormChange({ ...form, defaultValue: next })}
              disabled={fieldsDisabled}
              aria-label="Default Value"
              labelPrefix="Default Value"
            />
            {formErrors.defaultValue ? <p className="text-xs text-danger">{formErrors.defaultValue}</p> : null}
          </div>
        ) : (
          <Field label="Default Value" error={formErrors.defaultValue}>
            <ValueEditor
              type={variable.type}
              value={form.defaultValue}
              onChange={(next) => onDefinitionFormChange({ ...form, defaultValue: next })}
              invalid={formErrors.defaultValue !== null}
              disabled={fieldsDisabled}
              aria-label="Default Value"
            />
          </Field>
        )}
        {definitionError ? <Alert tone="danger">{definitionError}</Alert> : null}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!changed || hasErrors(formErrors) || fieldsDisabled}
            onClick={onSaveDefinition}
          >
            {savingDefinition ? <Spinner size={12} /> : null}
            Save Definition
          </Button>
          <DisabledReason reason={deleteVariableReason}>
            <Button
              variant="danger"
              size="sm"
              disabled={disabled || savingDefinition || deleteVariableReason !== null}
              onClick={onDeleteVariable}
            >
              Delete Variable
            </Button>
          </DisabledReason>
        </div>
      </Section>
    </div>
  );
}
