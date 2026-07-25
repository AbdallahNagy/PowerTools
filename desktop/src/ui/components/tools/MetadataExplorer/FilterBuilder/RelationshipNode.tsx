import { useRef } from "react";
import { useEntityRelationships } from "../hooks/useEntityRelationships";
import { useTableMetadata } from "../hooks/useTableMetadata";
import type {
  EntityInfo,
  FilterRelationship,
  RelationshipPathSegment,
} from "../model/types";
import type { ValidationError } from "../model/validation";
import type { useFilterTree } from "../hooks/useFilterTree";
import { GroupNode } from "./GroupNode";
import { useDrag } from "./DragContext";

type TreeActions = ReturnType<typeof useFilterTree>;

interface RelationshipNodeProps {
  node: FilterRelationship;
  connectionName: string | null;
  tables: EntityInfo[];
  errors: ValidationError[];
  depth: number;
  path: RelationshipPathSegment[];
  actions: TreeActions;
}

export function RelationshipNode({
  node,
  connectionName,
  tables,
  errors,
  depth,
  path,
  actions,
}: RelationshipNodeProps) {
  const fieldsQuery = useTableMetadata(node.relationship.targetEntity, connectionName);
  const relationshipsQuery = useEntityRelationships(node.relationship.targetEntity, connectionName);
  const targetEntity =
    tables.find((table) => table.logicalName === node.relationship.targetEntity) ??
    fallbackEntity(node.relationship.targetEntity);
  const childPath = [...path, node.relationship];
  const error = fieldsQuery.error ?? relationshipsQuery.error;
  const { dragId, beginDrag, endDrag } = useDrag();
  const isDragging = dragId === node.id;
  const handleArmed = useRef(false);

  return (
    <div
      draggable
      className={`border-l-2 border-[#007fd4] pl-3 ${isDragging ? "opacity-40" : ""}`}
      onDragStart={(event) => {
        if (!handleArmed.current) {
          event.preventDefault();
          return;
        }
        handleArmed.current = false;
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", node.id);
        beginDrag(node.id);
      }}
      onDragEnd={() => {
        handleArmed.current = false;
        endDrag();
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          data-drag-handle
          title="Drag to reorder"
          onMouseDown={() => {
            handleArmed.current = true;
          }}
          onMouseUp={() => {
            handleArmed.current = false;
          }}
          className="cursor-grab select-none px-0.5 text-sm leading-none text-[#858585] hover:text-white active:cursor-grabbing"
        >
          ⠿
        </span>
        <span className="text-xs text-[#858585]">Related</span>
        <span className="max-w-72 truncate text-sm font-medium text-[#cccccc]" title={relationshipLabel(node)}>
          {relationshipLabel(node)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            title="Duplicate related table filter"
            onClick={() => actions.duplicate(node.id)}
            className="rounded px-1 py-0.5 text-xs text-[#858585] hover:bg-[#2a2d2e] hover:text-white"
          >
            ⧉
          </button>
          <button
            type="button"
            title="Remove related table filter"
            onClick={() => actions.remove(node.id)}
            className="rounded px-1 py-0.5 text-xs text-[#858585] hover:bg-[#2a2d2e] hover:text-[#f48771]"
          >
            ✕
          </button>
        </div>
      </div>

      {fieldsQuery.isLoading || relationshipsQuery.isLoading ? (
        <p className="py-2 pl-2 text-xs text-[#858585]">Loading related table metadata...</p>
      ) : error ? (
        <p className="py-2 pl-2 text-xs text-[#f48771]">
          {(error as Error).message || "Could not load related table metadata."}
        </p>
      ) : (
        <GroupNode
          group={node.group}
          fields={fieldsQuery.data ?? []}
          rootEntity={targetEntity}
          connectionName={connectionName}
          tables={tables}
          relationships={relationshipsQuery.data ?? []}
          errors={errors}
          depth={depth + 1}
          path={childPath}
          isRoot
          actions={actions}
        />
      )}
    </div>
  );
}

function relationshipLabel(node: FilterRelationship): string {
  return node.relationship.label ?? `${node.relationship.targetEntity} (${node.relationship.sourceAttribute})`;
}

function fallbackEntity(logicalName: string): EntityInfo {
  return {
    logicalName,
    displayName: logicalName,
    primaryIdAttribute: "",
    primaryNameAttribute: "",
    isCustom: false,
  };
}
