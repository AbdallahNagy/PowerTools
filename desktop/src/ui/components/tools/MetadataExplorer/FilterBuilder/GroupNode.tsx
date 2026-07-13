import { Fragment, useRef } from "react";
import type { FilterGroup, FieldMetadata } from "../model/types";
import type { ValidationError } from "../model/validation";
import type { useFilterTree } from "../hooks/useFilterTree";
import { ConditionNode } from "./ConditionNode";
import { DropSlot } from "./DropSlot";
import { useDrag } from "./DragContext";

type TreeActions = ReturnType<typeof useFilterTree>;

interface GroupNodeProps {
  group: FilterGroup;
  fields: FieldMetadata[];
  errors: ValidationError[];
  depth: number;
  isRoot: boolean;
  actions: TreeActions;
}

const DEPTH_COLORS = [
  "border-[#3c3c3c]",
  "border-[#1e3a5f]",
  "border-[#2d3a1e]",
  "border-[#3a1e3a]",
];

export function GroupNode({
  group,
  fields,
  errors,
  depth,
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
            className="text-[#858585] hover:text-white cursor-grab active:cursor-grabbing select-none text-sm leading-none px-0.5"
          >
            ⠿
          </span>
        )}
        <button
          type="button"
          onClick={() => actions.toggleLogic(group.id)}
          className={`text-xs font-bold px-2 py-0.5 rounded border transition-colors ${
            group.logic === "and"
              ? "border-[#007fd4] text-[#007fd4] bg-[#1e2d3c] hover:bg-[#1e3a5f]"
              : "border-[#cc7832] text-[#cc7832] bg-[#2d1e0e] hover:bg-[#3a2512]"
          }`}
        >
          {group.logic.toUpperCase()}
        </button>

        <button
          type="button"
          onClick={() => actions.addCondition(group.id)}
          className="text-xs text-[#858585] hover:text-[#cccccc] px-1.5 py-0.5 rounded hover:bg-[#2a2d2e]"
        >
          + condition
        </button>

        <button
          type="button"
          onClick={() => actions.addGroup(group.id)}
          className="text-xs text-[#858585] hover:text-[#cccccc] px-1.5 py-0.5 rounded hover:bg-[#2a2d2e]"
        >
          + group
        </button>

        {!isRoot && (
          <button
            type="button"
            onClick={() => actions.remove(group.id)}
            className="ml-auto text-xs text-[#858585] hover:text-[#f48771] px-1.5 py-0.5 rounded hover:bg-[#2a2d2e]"
          >
            Remove group
          </button>
        )}
      </div>

      {groupErrors.map((e) => (
        <p key={e.message} className="text-xs text-[#f48771]">
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
                errors={errors}
                depth={depth + 1}
                isRoot={false}
                actions={actions}
              />
            ) : (
              <ConditionNode
                condition={child}
                fields={fields}
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
