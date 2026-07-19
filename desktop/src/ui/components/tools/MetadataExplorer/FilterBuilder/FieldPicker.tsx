import { useMemo, useState } from "react";
import type { EntityInfo, FieldMetadata, FieldReference, RelationshipMetadata } from "../model/types";
import { RelatedFieldPickerModal } from "./RelatedFieldPickerModal";

interface FieldPickerProps {
  value: FieldReference | null | undefined;
  fields: FieldMetadata[];
  rootEntity: EntityInfo;
  connectionName: string | null;
  tables: EntityInfo[];
  relationships: RelationshipMetadata[];
  onChange: (fieldRef: FieldReference) => void;
}

export function FieldPicker({
  value,
  fields,
  rootEntity,
  connectionName,
  tables,
  relationships,
  onChange,
}: FieldPickerProps) {
  const [relatedOpen, setRelatedOpen] = useState(false);
  const selectedValue = value?.kind === "root" ? value.field : value?.kind === "related" ? "__related" : "";
  const relatedLabel = useMemo(() => {
    if (value?.kind !== "related") return "Related field...";
    const path = value.path.map((segment) => segment.label ?? segment.targetEntity).join(" / ");
    return `${path} / ${value.fieldMetadata?.displayName ?? value.field}`;
  }, [value]);

  return (
    <>
      <select
        value={selectedValue}
        onChange={(e) => {
          if (e.target.value === "__related") {
            setRelatedOpen(true);
            return;
          }
          onChange({ kind: "root", field: e.target.value });
        }}
        title={value?.kind === "related" ? relatedLabel : undefined}
        className="w-56 shrink-0 bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm px-2 py-1 text-sm text-[#cccccc] focus:outline-none focus:border-[#007fd4]"
      >
        <option value="" disabled>
          Select field...
        </option>
        {fields.map((f) => (
          <option key={f.logicalName} value={f.logicalName}>
            {f.displayName} ({f.logicalName})
          </option>
        ))}
        <option value="__related">{relatedLabel}</option>
      </select>
      <RelatedFieldPickerModal
        open={relatedOpen}
        rootEntity={rootEntity}
        connectionName={connectionName}
        tables={tables}
        rootRelationships={relationships}
        onClose={() => setRelatedOpen(false)}
        onSelect={onChange}
      />
    </>
  );
}
