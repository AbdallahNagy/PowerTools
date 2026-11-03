import type { EnvironmentVariable, UpdateDefinitionBody } from "./types";
import { validateDescription, validateDisplayName, validateValue } from "./valueValidation";

export interface DefinitionForm {
  displayName: string;
  description: string;
  defaultValue: string;
}

export function definitionFormOf(variable: EnvironmentVariable): DefinitionForm {
  return {
    displayName: variable.displayName ?? "",
    description: variable.description ?? "",
    defaultValue: variable.defaultValue ?? "",
  };
}

/** Only the fields that differ from the stored definition. */
export function changedFields(variable: EnvironmentVariable, form: DefinitionForm): UpdateDefinitionBody {
  const stored = definitionFormOf(variable);
  const body: UpdateDefinitionBody = {};
  if (form.displayName !== stored.displayName) body.displayName = form.displayName.trim();
  if (form.description !== stored.description) body.description = form.description;
  if (form.defaultValue !== stored.defaultValue) body.defaultValue = form.defaultValue;
  return body;
}

export function hasChanges(variable: EnvironmentVariable, form: DefinitionForm | null): boolean {
  return form !== null && Object.keys(changedFields(variable, form)).length > 0;
}

export interface DefinitionFormErrors {
  displayName: string | null;
  description: string | null;
  defaultValue: string | null;
}

export function definitionFormErrors(type: number, form: DefinitionForm): DefinitionFormErrors {
  return {
    displayName: validateDisplayName(form.displayName),
    description: validateDescription(form.description),
    defaultValue: validateValue(type, form.defaultValue, false),
  };
}

export function hasErrors(errors: DefinitionFormErrors): boolean {
  return Object.values(errors).some((error) => error !== null);
}
