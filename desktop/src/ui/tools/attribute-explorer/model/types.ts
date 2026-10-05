export interface TableInfo {
  logicalName: string;
  schemaName: string;
  displayName: string | null;
  entitySetName: string | null;
  objectTypeCode: number | null;
  primaryIdAttribute: string | null;
  primaryNameAttribute: string | null;
  isCustom: boolean;
  isManaged: boolean;
  isIntersect: boolean;
  isActivity: boolean;
  ownershipType: string | null;
}

export interface OptionInfo {
  value: number;
  label: string;
}

export interface OptionSetInfo {
  name: string | null;
  isGlobal: boolean;
  options: OptionInfo[];
}

export interface BooleanOptionsInfo {
  trueLabel: string | null;
  falseLabel: string | null;
}

export interface RelationshipInfo {
  schemaName: string;
  referencedEntity: string;
}

export interface AttributeInfo {
  logicalName: string;
  schemaName: string;
  displayName: string | null;
  description: string | null;
  attributeType: string;
  attributeTypeName: string | null;
  requiredLevel: string;
  isCustom: boolean;
  isManaged: boolean;
  isPrimaryId: boolean;
  isPrimaryName: boolean;
  sourceType: number | null;
  introducedVersion: string | null;
  metadataId: string | null;
  columnNumber: number | null;
  isValidForCreate: boolean | null;
  isValidForUpdate: boolean | null;
  isValidForRead: boolean | null;
  isValidForAdvancedFind: boolean | null;
  isAuditEnabled: boolean | null;
  isSecured: boolean | null;
  isFilterable: boolean | null;
  isRetrievable: boolean | null;
  maxLength: number | null;
  format: string | null;
  dateTimeBehavior: string | null;
  minValue: string | null;
  maxValue: string | null;
  precision: number | null;
  targets: string[] | null;
  relationships: RelationshipInfo[] | null;
  optionSet: OptionSetInfo | null;
  booleanOptions: BooleanOptionsInfo | null;
  defaultValue: string | null;
}

export interface TablesResponse {
  tables: TableInfo[];
}

export interface TableAttributesResponse {
  table: TableInfo;
  attributes: AttributeInfo[];
}
