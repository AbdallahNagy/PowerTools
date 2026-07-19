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
  isInDefaultView: boolean;
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

export type RelationshipType = "many-to-one" | "one-to-many";

export interface RelationshipMetadata {
  schemaName: string;
  relationshipType: RelationshipType;
  sourceEntity: string;
  targetEntity: string;
  sourceAttribute: string;
  targetAttribute: string;
  displayName: string;
  isCustomRelationship: boolean;
  targets?: string[];
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

export type FieldReference =
  | {
      kind: "root";
      field: string;
    }
  | {
      kind: "related";
      path: RelationshipPathSegment[];
      field: string;
      fieldMetadata?: FieldMetadata;
    };

export interface RelationshipPathSegment {
  relationshipSchemaName: string;
  relationshipType: RelationshipType;
  sourceEntity: string;
  targetEntity: string;
  sourceAttribute: string;
  targetAttribute: string;
  linkFromAttribute: string;
  linkToAttribute: string;
  alias: string;
  label?: string;
}

export interface FilterCondition {
  id: string;
  kind: "condition";
  field: string | null;
  fieldRef?: FieldReference | null;
  operator: Operator | null;
  value?: string | string[];
  valueLabels?: Record<string, string>;
  lookupTarget?: string;
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
  columnTypes: Record<string, string>;
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
