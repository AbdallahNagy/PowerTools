import { useMemo, useState } from "react";
import { Alert, Button, Combobox, Field, Input, Modal, Select, Textarea } from "../../../shared/ui";
import { creatableTypes, valueKind, VARIABLE_TYPE, type CreateDefinitionBody, type SolutionOption } from "../model/types";
import {
  validateDescription,
  validateDisplayName,
  validateSchemaName,
  validateValue,
} from "../model/valueValidation";
import { ValueEditor } from "./ValueEditor";

interface NewVariableDialogProps {
  onPremises: boolean;
  solutions: SolutionOption[];
  solutionsLoading: boolean;
  solutionsError: string | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (body: CreateDefinitionBody) => void;
}

export function NewVariableDialog({
  onPremises,
  solutions,
  solutionsLoading,
  solutionsError,
  busy,
  error,
  onCancel,
  onCreate,
}: NewVariableDialogProps) {
  const types = creatableTypes(onPremises);
  const [schemaName, setSchemaName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [type, setType] = useState<number>(VARIABLE_TYPE.string);
  const [description, setDescription] = useState("");
  const [defaultValue, setDefaultValue] = useState("");
  const [solution, setSolution] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const selectedSolution = solutions.find((item) => item.uniqueName === solution) ?? null;
  const prefix = selectedSolution?.prefix || null;
  const errors = {
    schemaName: validateSchemaName(schemaName, prefix),
    displayName: validateDisplayName(displayName),
    description: validateDescription(description),
    defaultValue: validateValue(type, defaultValue, false),
  };
  const valid = Object.values(errors).every((item) => item === null);
  const show = (field: keyof typeof errors) => (touched[field] ? errors[field] : null);
  const touch = (field: string) => setTouched((current) => ({ ...current, [field]: true }));

  const solutionOptions = useMemo(
    () => [
      { value: "", label: "No solution" },
      ...solutions.map((item) => ({
        value: item.uniqueName,
        label: item.friendlyName,
        description: item.prefix ? `${item.uniqueName} · ${item.prefix}_` : item.uniqueName,
      })),
    ],
    [solutions],
  );

  const changeSolution = (next: string) => {
    setSolution(next);
    const nextPrefix = solutions.find((item) => item.uniqueName === next)?.prefix;
    if (nextPrefix && (schemaName.trim() === "" || /^[A-Za-z0-9]*_$/.test(schemaName))) {
      setSchemaName(`${nextPrefix}_`);
    }
  };

  const changeType = (next: number) => {
    setType(next);
    setDefaultValue("");
  };

  const create = () => {
    if (!valid) return;
    const body: CreateDefinitionBody = {
      schemaName: schemaName.trim(),
      displayName: displayName.trim(),
      type,
    };
    if (description) body.description = description;
    if (defaultValue) body.defaultValue = defaultValue;
    if (solution) body.solutionUniqueName = solution;
    onCreate(body);
  };

  const solutionHint = prefix
    ? `Schema names in this solution start with ${prefix}_.`
    : "Leave empty to create it without adding it to a solution.";

  return (
    <Modal open title="New Variable" onClose={onCancel} busy={busy} busyLabel="Creating…" widthClass="max-w-xl">
      <Field label="Schema Name" error={show("schemaName")}>
        <Input
          className="font-mono"
          value={schemaName}
          autoFocus
          required
          onChange={(event) => setSchemaName(event.target.value)}
          onBlur={() => touch("schemaName")}
        />
      </Field>
      <Field label="Display Name" error={show("displayName")}>
        <Input
          value={displayName}
          required
          onChange={(event) => setDisplayName(event.target.value)}
          onBlur={() => touch("displayName")}
        />
      </Field>
      <Field label="Type">
        <Select value={String(type)} onChange={(event) => changeType(Number(event.target.value))}>
          {types.map((item) => (
            <option key={item.type} value={item.type}>
              {item.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Description" error={errors.description}>
        <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      {valueKind(type) === "secret" ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-fg-muted">Default Value</span>
          <ValueEditor
            type={type}
            value={defaultValue}
            onChange={setDefaultValue}
            aria-label="Default Value"
            labelPrefix="Default Value"
          />
          {errors.defaultValue && defaultValue ? <p className="text-xs text-danger">{errors.defaultValue}</p> : null}
        </div>
      ) : (
        <Field label="Default Value" error={errors.defaultValue}>
          <ValueEditor
            type={type}
            value={defaultValue}
            onChange={setDefaultValue}
            invalid={errors.defaultValue !== null}
            aria-label="Default Value"
          />
        </Field>
      )}
      <Field label="Solution" hint={solutionsError ? undefined : solutionHint} error={solutionsError}>
        <Combobox
          value={solution}
          options={solutionOptions}
          onChange={changeSolution}
          disabled={solutionsLoading}
          placeholder={solutionsLoading ? "Loading solutions…" : "No solution"}
          emptyMessage="No unmanaged solutions match."
        />
      </Field>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={create} disabled={!valid || busy}>
          Create
        </Button>
      </div>
    </Modal>
  );
}
