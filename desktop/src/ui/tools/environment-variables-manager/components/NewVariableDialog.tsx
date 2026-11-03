import { useMemo, useState } from "react";
import { Alert, Button, Combobox, Field, Input, Modal, Select, Textarea } from "../../../shared/ui";
import { creatableTypes, VARIABLE_TYPE, type CreateDefinitionBody, type SolutionOption } from "../model/types";
import {
  DEFAULT_SCHEMA_PREFIX,
  schemaNameFromDisplayName,
  validateDescription,
  validateDisplayName,
  validateSchemaName,
  validateValue,
} from "../model/valueValidation";
import { ValueField } from "./ValueField";

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
  const [solution, setSolution] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [schemaName, setSchemaName] = useState(() => schemaNameFromDisplayName("", null));
  // The schema name follows the display name until the user types in it.
  const [schemaEdited, setSchemaEdited] = useState(false);
  const [type, setType] = useState<number>(VARIABLE_TYPE.string);
  const [description, setDescription] = useState("");
  const [defaultValue, setDefaultValue] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const prefixOf = (uniqueName: string) => solutions.find((item) => item.uniqueName === uniqueName)?.prefix || null;
  const prefix = prefixOf(solution);
  const errors = {
    schemaName: validateSchemaName(schemaName, prefix),
    displayName: validateDisplayName(displayName),
    description: validateDescription(description),
    defaultValue: validateValue(type, defaultValue, false),
    currentValue: validateValue(type, currentValue, false),
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
    const nextPrefix = prefixOf(next);
    if (!schemaEdited) {
      setSchemaName(schemaNameFromDisplayName(displayName, nextPrefix));
      return;
    }
    // Swap only the prefix of a schema name the user typed.
    const oldHead = `${prefix || DEFAULT_SCHEMA_PREFIX}_`;
    if (schemaName.toLowerCase().startsWith(oldHead.toLowerCase())) {
      setSchemaName(`${nextPrefix || DEFAULT_SCHEMA_PREFIX}_${schemaName.slice(oldHead.length)}`);
    }
  };

  const changeDisplayName = (next: string) => {
    setDisplayName(next);
    if (!schemaEdited) setSchemaName(schemaNameFromDisplayName(next, prefix));
  };

  const changeType = (next: number) => {
    setType(next);
    setDefaultValue("");
    setCurrentValue("");
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
    if (currentValue) body.initialValue = currentValue;
    if (solution) body.solutionUniqueName = solution;
    onCreate(body);
  };

  const solutionHint = prefix
    ? `Schema names in this solution start with ${prefix}_.`
    : "Leave empty to create it without adding it to a solution.";

  return (
    <Modal open title="New Variable" onClose={onCancel} busy={busy} busyLabel="Creating…" widthClass="max-w-xl">
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
      <Field label="Display Name" error={show("displayName")}>
        <Input
          value={displayName}
          autoFocus
          required
          onChange={(event) => changeDisplayName(event.target.value)}
          onBlur={() => touch("displayName")}
        />
      </Field>
      <Field label="Schema Name" error={show("schemaName")} hint="Filled in from the display name. You can change it.">
        <Input
          className="font-mono"
          value={schemaName}
          required
          onChange={(event) => {
            setSchemaEdited(true);
            setSchemaName(event.target.value);
          }}
          onBlur={() => touch("schemaName")}
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
      <ValueField
        label="Default Value"
        type={type}
        value={defaultValue}
        onChange={setDefaultValue}
        error={defaultValue ? errors.defaultValue : null}
      />
      <ValueField
        label="Current Value"
        type={type}
        value={currentValue}
        onChange={setCurrentValue}
        error={currentValue ? errors.currentValue : null}
        hint="Optional. Leave empty to use the default value."
      />
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
