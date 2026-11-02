/** Environment variable type codes. Map by the integer, never by the label. */
export const VARIABLE_TYPE = {
  string: 100000000,
  number: 100000001,
  boolean: 100000002,
  json: 100000003,
  dataSource: 100000004,
  secret: 100000005,
} as const;

/** `secretstore` values. Azure Key Vault is the only supported store. */
export const SECRET_STORE = { azureKeyVault: 0, dataverse: 1 } as const;

export interface ValueRow {
  valueId: string;
  value: string | null;
  isManaged: boolean;
}

export interface EnvironmentVariable {
  definitionId: string;
  schemaName: string;
  displayName: string | null;
  description: string | null;
  type: number;
  typeLabel: string;
  defaultValue: string | null;
  valueId: string | null;
  currentValue: string | null;
  secretStore: number | null;
  isManaged: boolean;
  isCustomizable: boolean;
  isActive: boolean;
  valueIsManaged: boolean;
  managedValueSolutions: string[];
  /** Filled when a definition has more than one value row. No value is picked for it. */
  conflictingValues: ValueRow[];
}

export interface SolutionOption {
  uniqueName: string;
  friendlyName: string;
  prefix: string;
}

export interface CreateDefinitionBody {
  schemaName: string;
  displayName: string;
  description?: string;
  type: number;
  defaultValue?: string;
  solutionUniqueName?: string;
}

export interface CreateDefinitionResponse {
  variable: EnvironmentVariable;
  valueError: string | null;
}

export interface UpdateDefinitionBody {
  displayName?: string;
  description?: string;
  defaultValue?: string;
}

export interface SaveValueItem {
  definitionId: string;
  valueId: string | null;
  value: string;
}

export interface SaveValueResult {
  definitionId: string;
  valueId: string | null;
  ok: boolean;
  error: string | null;
}

export interface SaveValuesResponse {
  results: SaveValueResult[];
}

export interface DeleteDefinitionResponse {
  remainingValueIds: string[];
}

/** How a value is edited. Any type without its own editor, such as Data Source, is plain text. */
export type ValueKind = "text" | "number" | "boolean" | "json" | "secret";

export function valueKind(type: number): ValueKind {
  switch (type) {
    case VARIABLE_TYPE.number:
      return "number";
    case VARIABLE_TYPE.boolean:
      return "boolean";
    case VARIABLE_TYPE.json:
      return "json";
    case VARIABLE_TYPE.secret:
      return "secret";
    default:
      return "text";
  }
}

/** Types offered in New Variable. Data Source needs connector settings; Secret needs Azure. */
export function creatableTypes(onPremises: boolean): Array<{ type: number; label: string }> {
  const types = [
    { type: VARIABLE_TYPE.string, label: "Text" },
    { type: VARIABLE_TYPE.number, label: "Number" },
    { type: VARIABLE_TYPE.boolean, label: "Boolean" },
    { type: VARIABLE_TYPE.json, label: "JSON" },
  ];
  return onPremises ? types : [...types, { type: VARIABLE_TYPE.secret, label: "Secret" }];
}

/** Why a variable's value cannot be edited here, or null. */
export function valueReadOnlyReason(variable: EnvironmentVariable): string | null {
  if (variable.conflictingValues.length > 0) {
    return `This variable has ${variable.conflictingValues.length} value rows. Delete the extra rows in the maker portal before editing.`;
  }
  if (variable.type === VARIABLE_TYPE.secret && variable.secretStore === SECRET_STORE.dataverse) {
    return "Secrets stored in Dataverse are read-only here. Azure Key Vault is the supported secret store.";
  }
  return null;
}

/** Why a definition's fields cannot be edited, or null. */
export function definitionReadOnlyReason(variable: EnvironmentVariable): string | null {
  if (variable.type === VARIABLE_TYPE.secret && variable.secretStore === SECRET_STORE.dataverse) {
    return "Secrets stored in Dataverse are read-only here.";
  }
  if (variable.isManaged && !variable.isCustomizable) {
    return "This definition belongs to a managed solution that does not allow customizing it.";
  }
  return null;
}
