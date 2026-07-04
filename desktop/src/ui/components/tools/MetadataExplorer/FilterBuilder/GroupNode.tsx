import type { FilterGroup, FieldMetadata } from "../model/types";
import type { ValidationError } from "../model/validation";
import type { useFilterTree } from "../hooks/useFilterTree";
import { ConditionNode } from "./ConditionNode";

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

export function GroupNode({ group, fields, errors, depth, isRoot, actions }: GroupNodeProps) {
  const borderColor = DEPTH_COLORS[depth % DEPTH_COLORS.length];
  const groupErrors = errors.filter((e) => e.nodeId === group.id);

  return (
    <div className={`flex flex-col gap-2 border-l-2 ${borderColor} pl-3`}>
      {/* Group header */}
      <div className="flex items-center gap-2">
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
        {group.children.map((child) =>
          child.kind === "group" ? (
            <GroupNode
              key={child.id}
              group={child}
              fields={fields}
              errors={errors}
              depth={depth + 1}
              isRoot={false}
              actions={actions}
            />
          ) : (
            <ConditionNode
              key={child.id}
              condition={child}
              fields={fields}
              errors={errors}
              canRemove={group.children.length > 1}
              actions={actions}
            />
          )
        )}
      </div>
    </div>
  );
}
