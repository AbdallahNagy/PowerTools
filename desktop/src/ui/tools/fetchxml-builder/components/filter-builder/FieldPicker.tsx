import { useMemo } from "react";
import { createRelationshipPathSegment } from "../../model/fetchxml";
import { lookupRelationshipChoices } from "../../model/relationships";
import type { EntityInfo } from "../../../../shared/contracts/dataverse";
import type {
  FieldMetadata,
  FieldReference,
  RelationshipMetadata,
  RelationshipPathSegment,
} from "../../model/types";
import { Combobox, type ComboboxOption } from "../../../../shared/ui";

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
  const relationshipChoices = useMemo(
    () => lookupRelationshipChoices(relationships, tables, fields),
    [fields, relationships, tables],
  );
  const options = useMemo<ComboboxOption[]>(() => {
    const fieldOptions = sortedFields.map((field) => ({
      value: `field:${field.logicalName}`,
      label: field.displayName || field.logicalName,
      description: field.displayName ? field.logicalName : undefined,
      group: "Fields",
    }));
    const relationshipOptions = allowRelationships
      ? relationshipChoices.map(({ relationship, label }, index) => ({
          value: `relationship:${index}`,
          label,
          description: relationship.targetEntity,
          group: "Related tables",
        }))
      : [];
    const legacy =
      value?.kind === "related" ? [{ value: "legacy-related", label: legacyFieldLabel(value) }] : [];
    return [...legacy, ...fieldOptions, ...relationshipOptions];
  }, [allowRelationships, relationshipChoices, sortedFields, value]);
  const selectedValue =
    value?.kind === "root"
      ? `field:${value.field}`
      : value?.kind === "related"
        ? "legacy-related"
        : "";

  return (
    <Combobox
      value={selectedValue}
      options={options}
      placeholder="Select field..."
      emptyMessage="No fields match."
      onChange={(next) => {
        if (next.startsWith("field:")) {
          onChange({ kind: "root", field: next.slice("field:".length) });
          return;
        }
        if (next.startsWith("relationship:")) {
          const choice = relationshipChoices[Number(next.slice("relationship:".length))];
          if (!choice) return;
          onSelectRelationship(createRelationshipPathSegment(choice.relationship, path, choice.label));
        }
      }}
      className="w-56 shrink-0 [&>input]:py-1"
    />
  );
}

function fieldLabel(field: FieldMetadata): string {
  return field.displayName || field.logicalName;
}

function legacyFieldLabel(value: Extract<FieldReference, { kind: "related" }>): string {
  const path = value.path.map((segment) => segment.label ?? segment.targetEntity);
  path.push(value.fieldMetadata?.displayName ?? value.field);
  return path.join(" > ");
}
