import { useMemo } from "react";
import { SearchableSelect, type SearchableSelectOption } from "../../../../shared/ui";
import { createRelationshipPathSegment, selectLookupRelationships } from "../../model/fetchxml";
import type { EntityInfo } from "../../../../shared/contracts/dataverse";
import type {
  FieldMetadata,
  FieldReference,
  RelationshipMetadata,
  RelationshipPathSegment,
} from "../../model/types";

interface FieldPickerProps {
  value: FieldReference | null | undefined;
  fields: FieldMetadata[];
  tables: EntityInfo[];
  relationships: RelationshipMetadata[];
  path: RelationshipPathSegment[];
  allowRelationships: boolean;
  onChange: (fieldRef: FieldReference) => void;
  onSelectRelationship: (relationship: RelationshipPathSegment) => void;
}

export function FieldPicker({
  value,
  fields,
  tables,
  relationships,
  path,
  allowRelationships,
  onChange,
  onSelectRelationship,
}: FieldPickerProps) {
  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => fieldLabel(a).localeCompare(fieldLabel(b))),
    [fields],
  );
  const sortedRelationships = useMemo(
    () =>
      selectLookupRelationships(relationships).sort((a, b) =>
        relationshipLabel(a, tables, fields).localeCompare(relationshipLabel(b, tables, fields)),
      ),
    [fields, relationships, tables],
  );
  const selectedValue =
    value?.kind === "root"
      ? `field:${value.field}`
      : value?.kind === "related"
        ? "legacy-related"
        : "";

  const options = useMemo(() => {
    const next: SearchableSelectOption[] = [];
    if (value?.kind === "related") {
      next.push({ value: "legacy-related", label: legacyFieldLabel(value) });
    }
    for (const field of sortedFields) {
      next.push({
        value: `field:${field.logicalName}`,
        label: field.displayName,
        description: field.logicalName,
        group: "Fields",
      });
    }
    if (allowRelationships) {
      sortedRelationships.forEach((relationship, index) => {
        next.push({
          value: `relationship:${index}`,
          label: relationshipLabel(relationship, tables, fields),
          group: "Related tables",
        });
      });
    }
    return next;
  }, [allowRelationships, fields, sortedFields, sortedRelationships, tables, value]);

  return (
    <SearchableSelect
      aria-label="Field"
      value={selectedValue}
      onChange={(next) => {
        if (next.startsWith("field:")) {
          onChange({ kind: "root", field: next.slice("field:".length) });
          return;
        }
        if (next.startsWith("relationship:")) {
          const relationship = sortedRelationships[Number(next.slice("relationship:".length))];
          if (!relationship) return;
          const label = relationshipLabel(relationship, tables, fields);
          onSelectRelationship(createRelationshipPathSegment(relationship, path, label));
        }
      }}
      options={options}
      placeholder="Select field..."
      searchPlaceholder="Search fields…"
      className="w-56 shrink-0"
    />
  );
}

function fieldLabel(field: FieldMetadata): string {
  return field.displayName || field.logicalName;
}

function relationshipLabel(
  relationship: RelationshipMetadata,
  tables: EntityInfo[],
  fields: FieldMetadata[],
): string {
  const target = tables.find((table) => table.logicalName === relationship.targetEntity);
  const lookup = fields.find((field) => field.logicalName === relationship.sourceAttribute);
  return `${lookup?.displayName ?? relationship.sourceAttribute} > ${target?.displayName ?? relationship.targetEntity}`;
}

function legacyFieldLabel(value: Extract<FieldReference, { kind: "related" }>): string {
  const path = value.path.map((segment) => segment.label ?? segment.targetEntity);
  path.push(value.fieldMetadata?.displayName ?? value.field);
  return path.join(" > ");
}
