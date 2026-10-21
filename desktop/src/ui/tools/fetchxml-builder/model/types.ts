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
  | "on-or-after"
  | UserOperator
  | RelativeDateOperator
  | RelativeCountOperator;

/** Operators that compare a lookup with the signed-in user or their teams. Take no value. */
export type UserOperator =
  | "eq-userid"
  | "ne-userid"
  | "eq-userteams"
  | "eq-useroruserteams"
  | "eq-useroruserhierarchy"
  | "eq-useroruserhierarchyandteams"
  | "eq-businessid"
  | "ne-businessid";

/** Date operators relative to today. Take no value. */
export type RelativeDateOperator =
  | "today"
  | "yesterday"
  | "tomorrow"
  | "this-week"
  | "last-week"
  | "next-week"
  | "this-month"
  | "last-month"
  | "next-month"
  | "this-year"
  | "last-year"
  | "next-year"
  | "last-seven-days"
  | "next-seven-days"
  | "this-fiscal-year"
  | "last-fiscal-year"
  | "next-fiscal-year"
  | "this-fiscal-period"
  | "last-fiscal-period"
  | "next-fiscal-period";

/** Date operators that take a whole number, such as "last 7 days". */
export type RelativeCountOperator =
  | "last-x-hours"
  | "next-x-hours"
  | "last-x-days"
  | "next-x-days"
  | "last-x-weeks"
  | "next-x-weeks"
  | "last-x-months"
  | "next-x-months"
  | "last-x-years"
  | "next-x-years"
  | "olderthan-x-days"
  | "olderthan-x-weeks"
  | "olderthan-x-months"
  | "olderthan-x-years";

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

export interface FilterRelationship {
  id: string;
  kind: "relationship";
  relationship: RelationshipPathSegment;
  group: FilterGroup;
}

export type FilterNode = FilterCondition | FilterGroup | FilterRelationship;

export interface EntityView {
  id: string;
  name: string;
  kind: "system" | "personal";
  isDefault: boolean;
  columns: string[];
  fetchXml: string;
}

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
  returnTotalRecordCount?: boolean;
}
