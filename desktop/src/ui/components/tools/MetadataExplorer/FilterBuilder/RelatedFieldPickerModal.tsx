import { useMemo, useState } from "react";
import { Modal } from "../../../ui/Modal";
import type {
  EntityInfo,
  FieldMetadata,
  FieldReference,
  RelationshipMetadata,
  RelationshipPathSegment,
} from "../model/types";
import { useEntityRelationships } from "../hooks/useEntityRelationships";
import { useTableMetadata } from "../hooks/useTableMetadata";

interface RelatedFieldPickerModalProps {
  open: boolean;
  rootEntity: EntityInfo;
  connectionName: string | null;
  tables: EntityInfo[];
  rootRelationships: RelationshipMetadata[];
  onClose: () => void;
  onSelect: (fieldRef: FieldReference) => void;
}

const MAX_DEPTH = 2;

export function RelatedFieldPickerModal({
  open,
  rootEntity,
  connectionName,
  tables,
  rootRelationships,
  onClose,
  onSelect,
}: RelatedFieldPickerModalProps) {
  const [path, setPath] = useState<RelationshipPathSegment[]>([]);
  const currentEntity = path.at(-1)?.targetEntity ?? rootEntity.logicalName;
  const selectedTarget = path.at(-1)?.targetEntity ?? null;
  const { data: currentRelationships } = useEntityRelationships(
    currentEntity === rootEntity.logicalName ? null : currentEntity,
    connectionName,
  );
  const { data: targetFields, isLoading: targetFieldsLoading } = useTableMetadata(selectedTarget, connectionName);

  const relationships = currentEntity === rootEntity.logicalName
    ? rootRelationships
    : currentRelationships ?? [];

  const sortedRelationships = useMemo(
    () => [...relationships].sort((a, b) => relationshipLabel(a, tables).localeCompare(relationshipLabel(b, tables))),
    [relationships, tables],
  );
  const sortedFields = useMemo(
    () => [...(targetFields ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [targetFields],
  );

  if (!open) return null;

  const handleRelationshipChange = (schemaName: string) => {
    const relationship = sortedRelationships.find((r) => r.schemaName === schemaName);
    if (!relationship) return;
    setPath((prev) => [...prev, toPathSegment(relationship, prev.length, tables)]);
  };

  const handleSelectField = (field: FieldMetadata) => {
    onSelect({
      kind: "related",
      path,
      field: field.logicalName,
      fieldMetadata: field,
    });
    setPath([]);
    onClose();
  };

  return (
    <Modal open={open} title="Select related field" onClose={onClose} widthClass="max-w-3xl">
      <div className="flex flex-col gap-3 w-[520px] max-w-[80vw] text-[#cccccc]">
        <div className="flex items-center gap-2 text-xs text-[#858585]">
          <span>{rootEntity.displayName}</span>
          {path.map((segment) => (
            <span key={segment.alias} className="text-[#cccccc]">
              / {segment.label ?? segment.targetEntity}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value=""
            onChange={(e) => handleRelationshipChange(e.target.value)}
            disabled={path.length >= MAX_DEPTH}
            className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm px-2 py-1.5 text-sm text-[#cccccc] focus:outline-none focus:border-[#007fd4] disabled:opacity-60"
          >
            <option value="">
              {path.length >= MAX_DEPTH ? "Maximum relationship depth reached" : "Choose relationship..."}
            </option>
            {sortedRelationships.map((relationship) => (
              <option key={relationship.schemaName} value={relationship.schemaName}>
                {relationshipLabel(relationship, tables)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPath((prev) => prev.slice(0, -1))}
            disabled={path.length === 0}
            className="text-xs text-[#858585] hover:text-[#cccccc] px-2 py-1 rounded hover:bg-[#2a2d2e] disabled:opacity-40"
          >
            Back
          </button>
        </div>

        <div className="border border-[#3c3c3c] rounded-sm max-h-72 overflow-auto">
          {path.length === 0 ? (
            <p className="text-xs text-[#858585] p-3">Choose a relationship, then select a field.</p>
          ) : targetFieldsLoading ? (
            <p className="text-xs text-[#858585] p-3">Loading fields...</p>
          ) : (
            <div className="divide-y divide-[#2a2d2e]">
              {sortedFields.map((field) => (
                <button
                  key={field.logicalName}
                  type="button"
                  onClick={() => handleSelectField(field)}
                  className="w-full text-left px-3 py-2 hover:bg-[#2a2d2e] flex flex-col gap-0.5"
                >
                  <span className="text-sm text-[#cccccc]">{field.displayName}</span>
                  <span className="text-xs text-[#858585]">{field.logicalName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function toPathSegment(
  relationship: RelationshipMetadata,
  index: number,
  tables: EntityInfo[],
): RelationshipPathSegment {
  return {
    relationshipSchemaName: relationship.schemaName,
    relationshipType: relationship.relationshipType,
    sourceEntity: relationship.sourceEntity,
    targetEntity: relationship.targetEntity,
    sourceAttribute: relationship.sourceAttribute,
    targetAttribute: relationship.targetAttribute,
    linkFromAttribute: relationship.targetAttribute,
    linkToAttribute: relationship.sourceAttribute,
    alias: makeAlias(relationship, index),
    label: relationshipLabel(relationship, tables),
  };
}

function makeAlias(relationship: RelationshipMetadata, index: number): string {
  return `rel_${index}_${relationship.targetEntity}_${relationship.targetAttribute}`.replace(/[^a-zA-Z0-9_]/g, "_");
}

function relationshipLabel(relationship: RelationshipMetadata, tables: EntityInfo[]): string {
  const target = tables.find((table) => table.logicalName === relationship.targetEntity);
  const direction = relationship.relationshipType === "many-to-one" ? "parent" : "child";
  return `${target?.displayName ?? relationship.targetEntity} (${direction}: ${relationship.sourceAttribute})`;
}
