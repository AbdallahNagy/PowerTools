import { Fragment, useRef } from "react";
import type { EntityInfo } from "../../../../shared/contracts/dataverse";
import type {
  FilterGroup,
  FieldMetadata,
  RelationshipMetadata,
  RelationshipPathSegment,
} from "../../model/types";
import type { ValidationError } from "../../model/validation";
import type { useFilterTree } from "../../hooks/useFilterTree";
import { ConditionNode } from "./ConditionNode";
import { DropSlot } from "./DropSlot";
import { useDrag } from "./useDrag";
import { RelationshipNode } from "./RelationshipNode";

type TreeActions = ReturnType<typeof useFilterTree>;

interface GroupNodeProps {
  group: FilterGroup;
  fields: FieldMetadata[];
  rootEntity: EntityInfo;
  connectionName: string | null;
  tables: EntityInfo[];
  relationships: RelationshipMetadata[];
  errors: ValidationError[];
  depth: number;
  path: RelationshipPathSegment[];
  isRoot: boolean;
  actions: TreeActions;
}

const DEPTH_COLORS = [
  "border-line",
  "border-accent-text/30",
  "border-nest-a",
  "border-nest-b",
];

export function GroupNode({
  group,
  fields,
  rootEntity,
  connectionName,
  tables,
  relationships,
  errors,
  depth,
  path,
  isRoot,
  actions,
}: GroupNodeProps) {
  const borderColor = DEPTH_COLORS[depth % DEPTH_COLORS.length];
  const groupErrors = errors.filter((e) => e.nodeId === group.id);
  const { dragId, beginDrag, endDrag } = useDrag();
  const isDragging = dragId === group.id;
  const handleArmed = useRef(false);

  const inner = (
    <div className={`flex flex-col gap-2 border-l-2 ${borderColor} pl-3 ${isDragging ? "opacity-40" : ""}`}>
      {/* Group header */}
      <div className="flex items-center gap-2">
        {!isRoot && (
          <span
            data-drag-handle
            title="Drag to reorder"
            onMouseDown={() => {
              handleArmed.current = true;
            }}
            onMouseUp={() => {
              handleArmed.current = false;
            }}
            className="text-fg-muted hover:text-fg-strong cursor-grab active:cursor-grabbing select-none text-sm leading-none px-0.5"
          >
            ⠿
          </span>
        )}
        <button
          type="button"
          onClick={() => actions.toggleLogic(group.id)}
          className={`text-xs font-bold px-2 py-0.5 rounded border transition-colors ${
            group.logic === "and"
              ? "border-accent-text text-accent-text bg-accent-soft hover:bg-accent-text/25"
              : "border-alt text-alt bg-alt-soft hover:bg-alt/25"
          }`}
        >
          {group.logic.toUpperCase()}
        </button>

        <button
          type="button"
          onClick={() => actions.addCondition(group.id)}
          className="text-xs text-fg-muted hover:text-fg px-1.5 py-0.5 rounded hover:bg-hover"
        >
          + condition
        </button>

        <button
          type="button"
          onClick={() => actions.addGroup(group.id)}
          className="text-xs text-fg-muted hover:text-fg px-1.5 py-0.5 rounded hover:bg-hover"
        >
          + group
        </button>

        {!isRoot && (
          <button
            type="button"
            onClick={() => actions.remove(group.id)}
            className="ml-auto text-xs text-fg-muted hover:text-danger px-1.5 py-0.5 rounded hover:bg-hover"
          >
            Remove group
          </button>
        )}
      </div>

      {groupErrors.map((e) => (
        <p key={e.message} className="text-xs text-danger">
          {e.message}
        </p>
      ))}

      {/* Children */}
      <div className="flex flex-col gap-2">
        <DropSlot parentId={group.id} index={0} onDrop={actions.move} />
        {group.children.map((child, i) => (
          <Fragment key={child.id}>
            {child.kind === "group" ? (
              <GroupNode
                group={child}
                fields={fields}
                rootEntity={rootEntity}
                connectionName={connectionName}
                tables={tables}
                relationships={relationships}
                errors={errors}
                depth={depth + 1}
                path={path}
                isRoot={false}
                actions={actions}
              />
            ) : child.kind === "relationship" ? (
              <RelationshipNode
                node={child}
                connectionName={connectionName}
                tables={tables}
                errors={errors}
                depth={depth + 1}
                path={path}
                actions={actions}
              />
            ) : (
              <ConditionNode
                condition={child}
                fields={fields}
                rootEntity={rootEntity}
                tables={tables}
                relationships={relationships}
                path={path}
                allowRelationships={group.logic === "and"}
                errors={errors}
                canRemove={group.children.length > 1}
                actions={actions}
              />
            )}
            <DropSlot parentId={group.id} index={i + 1} onDrop={actions.move} />
          </Fragment>
        ))}
      </div>
    </div>
  );

  if (isRoot) return inner;

  return (
    <div
      draggable
      onDragStart={(e) => {
        if (!handleArmed.current) {
          e.preventDefault();
          return;
        }
        handleArmed.current = false;
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", group.id);
        beginDrag(group.id);
      }}
      onDragEnd={() => {
        handleArmed.current = false;
        endDrag();
      }}
    >
      {inner}
    </div>
  );
}
