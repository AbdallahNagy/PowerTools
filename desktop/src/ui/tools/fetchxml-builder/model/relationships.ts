import type { EntityInfo } from "../../../shared/contracts/dataverse";
import { selectLookupRelationships } from "./fetchxml";
import type { FieldMetadata, RelationshipMetadata } from "./types";

export interface LookupRelationshipChoice {
  relationship: RelationshipMetadata;
  /** "Lookup column > Related table", using display names when they are known. */
  label: string;
}

/**
 * The many-to-one relationships a filter can join through, labelled by the
 * lookup column and the table it points to, and sorted by that label.
 */
export function lookupRelationshipChoices(
  relationships: RelationshipMetadata[],
  tables: EntityInfo[],
  fields: FieldMetadata[],
): LookupRelationshipChoice[] {
  return selectLookupRelationships(relationships)
    .map((relationship) => ({ relationship, label: relationshipLabel(relationship, tables, fields) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function relationshipLabel(
  relationship: RelationshipMetadata,
  tables: EntityInfo[],
  fields: FieldMetadata[],
): string {
  const target = tables.find((table) => table.logicalName === relationship.targetEntity);
  const lookup = fields.find((field) => field.logicalName === relationship.sourceAttribute);
  return `${lookup?.displayName || relationship.sourceAttribute} > ${target?.displayName || relationship.targetEntity}`;
}
