import { useMemo } from "react";
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

  return (
    <select
      value={selectedValue}
      onChange={(event) => {
        const next = event.target.value;
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
      className="w-56 shrink-0 rounded-sm border border-[#3c3c3c] bg-[#1e1e1e] px-2 py-1 text-sm text-[#cccccc] focus:border-[#007fd4] focus:outline-none"
    >
      <option value="" disabled>
        Select field...
      </option>
      {value?.kind === "related" && (
        <option value="legacy-related">{legacyFieldLabel(value)}</option>
      )}
      <optgroup label="Fields">
        {sortedFields.map((field) => (
          <option key={field.logicalName} value={`field:${field.logicalName}`}>
            {field.displayName} ({field.logicalName})
          </option>
        ))}
      </optgroup>
      {allowRelationships && sortedRelationships.length > 0 && (
        <optgroup label="Related tables">
          {sortedRelationships.map((relationship, index) => (
            <option
              key={`${relationship.schemaName}:${relationship.targetEntity}:${relationship.sourceAttribute}`}
              value={`relationship:${index}`}
            >
              {relationshipLabel(relationship, tables, fields)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
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
