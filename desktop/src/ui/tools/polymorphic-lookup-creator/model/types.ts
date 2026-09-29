export interface CascadeSettings {
  assign: "NoCascade";
  delete: "RemoveLink";
  merge: "NoCascade";
  reparent: "NoCascade";
  share: "NoCascade";
  unshare: "NoCascade";
  rollupView: "NoCascade";
}

export type MenuBehavior = "UseCollectionName" | "UseLabel" | "DoNotDisplay";
export type MenuGroup = "Details" | "Sales" | "Service" | "Marketing";

export interface CascadeDto {
  assign: string;
  delete: string;
  merge: string;
  reparent: string;
  share: string;
  unshare: string;
  rollupView: string;
}

export interface ManyToOneRelationship {
  schemaName: string;
  referencingAttribute: string;
  referencedEntity: string;
  referencedAttribute: string;
  isValidForAdvancedFind: boolean;
  cascade: CascadeDto;
  associatedMenuBehavior: string;
  associatedMenuGroup: string;
  associatedMenuOrder: number | null;
  associatedMenuLabel: string | null;
}

export interface LookupColumn {
  logicalName: string;
  schemaName: string;
  displayName: string;
  targets: string[];
  isManaged: boolean | null;
  isCustomizable: boolean | null;
}

export interface PolymorphicEntity {
  logicalName: string;
  schemaName: string;
  displayName: string;
  primaryIdAttribute: string;
  canBePrimaryEntityInRelationship: boolean;
  canBeRelatedEntityInRelationship: boolean;
  tableType: string | null;
  isSolutionAware: boolean;
  lookups: LookupColumn[];
  manyToOne: ManyToOneRelationship[];
}

export interface PolymorphicMetadata {
  languageCode: number;
  entities: PolymorphicEntity[];
}

export interface UnmanagedSolution {
  uniqueName: string;
  friendlyName: string;
  version: string;
  publisherName: string;
  customizationPrefix: string;
}

export interface RelationshipDraft {
  referencedLogicalName: string;
  schemaName: string;
  fragment: string;
  fragmentEdited: boolean;
  saved: boolean;
  isValidForAdvancedFind: boolean;
  menuBehavior: MenuBehavior;
  menuGroup: MenuGroup;
  menuOrder: number;
  menuLabel: string;
}

export interface RelationshipPayload {
  referencedEntityLogicalName: string;
  schemaName: string;
  isValidForAdvancedFind: boolean;
  cascade: CascadeSettings;
  associatedMenuBehavior: MenuBehavior;
  associatedMenuGroup: MenuGroup;
  associatedMenuOrder: number;
  associatedMenuLabel: string | null;
}

export interface EditPlan {
  adds: RelationshipDraft[];
  deletes: RelationshipDraft[];
  updates: RelationshipDraft[];
}
