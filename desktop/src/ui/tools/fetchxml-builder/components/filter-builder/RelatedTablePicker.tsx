import { useMemo, useState } from "react";
import type { EntityInfo } from "../../../../shared/contracts/dataverse";
import { Combobox, type ComboboxOption } from "../../../../shared/ui";
import { createRelationshipPathSegment } from "../../model/fetchxml";
import { lookupRelationshipChoices } from "../../model/relationships";
import type {
  FieldMetadata,
  RelationshipMetadata,
  RelationshipPathSegment,
} from "../../model/types";

interface RelatedTablePickerProps {
  fields: FieldMetadata[];
  tables: EntityInfo[];
  relationships: RelationshipMetadata[];
  path: RelationshipPathSegment[];
  onSelect: (relationship: RelationshipPathSegment) => void;
}

/**
 * "+ related table" for a filter group. Opens a searchable list of the
 * table's lookups; choosing one adds a link-entity filter scope to the group.
 */
export function RelatedTablePicker({
  fields,
  tables,
  relationships,
  path,
  onSelect,
}: RelatedTablePickerProps) {
  const [open, setOpen] = useState(false);
  const choices = useMemo(
    () => lookupRelationshipChoices(relationships, tables, fields),
    [fields, relationships, tables],
  );
  const options = useMemo<ComboboxOption[]>(
    () =>
      choices.map(({ relationship, label }, index) => ({
        value: String(index),
        label,
        description: relationship.targetEntity,
      })),
    [choices],
  );

  if (choices.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        title="Filter on a table that a lookup column points to"
        onClick={() => setOpen(true)}
        className="text-xs text-fg-muted hover:text-fg px-1.5 py-0.5 rounded hover:bg-hover"
      >
        + related table
      </button>
    );
  }

  return (
    <Combobox
      value=""
      options={options}
      autoFocus
      aria-label="Related table"
      placeholder="Search lookups..."
      emptyMessage="No lookups match."
      onChange={(next) => {
        const choice = choices[Number(next)];
        setOpen(false);
        if (choice) onSelect(createRelationshipPathSegment(choice.relationship, path, choice.label));
      }}
      onBlur={() => setOpen(false)}
      className="w-64 shrink-0 [&>input]:py-0.5 [&>input]:text-xs"
    />
  );
}
