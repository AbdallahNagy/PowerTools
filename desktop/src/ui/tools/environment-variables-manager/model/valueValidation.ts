import { isCompleteSecretPath, parseSecretPath } from "./secretPath";
import { valueKind } from "./types";

export const VALUE_MAX_LENGTH = 2000;
export const SCHEMA_NAME_MAX_LENGTH = 100;
export const DISPLAY_NAME_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 2000;

const NUMBER = /^-?\d+(\.\d+)?$/;
const SCHEMA_NAME = /^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+$/;
const RESERVED_DISPLAY_NAMES = ["$authentication", "$connection"];

function isJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Same rules as the sidecar. Dataverse does not validate values itself.
 * `required` is true for a current value and false for a default value.
 */
export function validateValue(type: number, value: string, required: boolean): string | null {
  if (value.length === 0) return required ? "Enter a value, or delete the value to use the default." : null;
  if (value.length > VALUE_MAX_LENGTH) return `The value is longer than ${VALUE_MAX_LENGTH} characters.`;

  switch (valueKind(type)) {
    case "number":
      return NUMBER.test(value) ? null : "Enter a decimal number.";
    case "boolean":
      return value === "yes" || value === "no" ? null : "Enter yes or no.";
    case "json":
      return isJson(value) ? null : "Enter valid JSON.";
    case "secret":
      if (isCompleteSecretPath(value)) return null;
      return parseSecretPath(value) ? "Fill in every part of the secret path." : "Enter an Azure Key Vault secret path.";
    default:
      return null;
  }
}

export function validateDisplayName(displayName: string): string | null {
  const trimmed = displayName.trim();
  if (!trimmed) return "Enter a display name.";
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return `The display name is longer than ${DISPLAY_NAME_MAX_LENGTH} characters.`;
  }
  if (RESERVED_DISPLAY_NAMES.includes(trimmed.toLowerCase())) return `${trimmed} is reserved. Choose another display name.`;
  return null;
}

export function validateDescription(description: string): string | null {
  return description.length > DESCRIPTION_MAX_LENGTH
    ? `The description is longer than ${DESCRIPTION_MAX_LENGTH} characters.`
    : null;
}

export function validateSchemaName(schemaName: string, prefix: string | null): string | null {
  const trimmed = schemaName.trim();
  if (!trimmed) return "Enter a schema name.";
  if (trimmed.length > SCHEMA_NAME_MAX_LENGTH) {
    return `The schema name is longer than ${SCHEMA_NAME_MAX_LENGTH} characters.`;
  }
  if (!SCHEMA_NAME.test(trimmed)) {
    return "Use a prefix, an underscore, then letters, digits, or underscores, such as contoso_ApiUrl.";
  }
  if (prefix && !trimmed.toLowerCase().startsWith(`${prefix.toLowerCase()}_`)) {
    return `The schema name must start with ${prefix}_, the solution publisher's prefix.`;
  }
  return null;
}
