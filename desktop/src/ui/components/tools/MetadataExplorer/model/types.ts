export type FieldType =
  | "String"
  | "Memo"
  | "Integer"
  | "BigInt"
  | "Decimal"
  | "Double"
  | "Money"
  | "DateTime"
  | "Boolean"
  | "Lookup"
  | "Owner"
  | "Customer"
  | "Picklist"
  | "State"
  | "Status"
  | "Uniqueidentifier"
  | "Virtual"
  | "Unknown";

export interface FieldOption {
  value: number;
  label: string;
}

export interface FieldMetadata {
  logicalName: string;
  displayName: string;
  attributeType: FieldType;
  isPrimaryId: boolean;
  isCustomAttribute: boolean;
  requiredLevel: string;
  isValidForCreate: boolean;
  isValidForUpdate: boolean;
  targets?: string[];
  optionSet?: FieldOption[];
  format?: string;
}

export interface EntityInfo {
  logicalName: string;
  displayName: string;
  primaryIdAttribute: string;
  primaryNameAttribute: string;
  isCustom: boolean;
}

export type Operator =
  | "eq"
  | "ne"
  | "like"
  | "not-like"
  | "begins-with"
  | "ends-with"
  | "gt"
  | "ge"
  | "lt"
  | "le"
  | "null"
  | "not-null"
  | "in"
  | "not-in"
  | "on"
  | "on-or-before"
  | "on-or-after";

export interface FilterCondition {
  id: string;
  kind: "condition";
  field: string | null;
  operator: Operator | null;
  value?: string | string[];
}

export interface FilterGroup {
  id: string;
  kind: "group";
  logic: "and" | "or";
  children: FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup;

export interface FetchResult {
  records: Record<string, unknown>[];
  columns: string[];
  moreRecords: boolean;
  pagingCookie: string | null;
  totalEstimate: number | null;
}

export interface ExecuteFetchRequest {
  fetchXml: string;
  page: number;
  pageSize: number;
  pagingCookie?: string;
}
