import type { FilterCondition, FieldMetadata, Operator } from "../model/types";
import type { ValidationError } from "../model/validation";
import type { useFilterTree } from "../hooks/useFilterTree";
import { FieldPicker } from "./FieldPicker";
import { OperatorPicker } from "./OperatorPicker";
import { ValueInput } from "./ValueInput";

type TreeActions = ReturnType<typeof useFilterTree>;

interface ConditionNodeProps {
  condition: FilterCondition;
  fields: FieldMetadata[];
  errors: ValidationError[];
  canRemove: boolean;
  actions: Pick<TreeActions, "updateCondition" | "remove" | "duplicate">;
}

export function ConditionNode({ condition, fields, errors, canRemove, actions }: ConditionNodeProps) {
  const field = fields.find((f) => f.logicalName === condition.field) ?? null;
  const nodeErrors = errors.filter((e) => e.nodeId === condition.id);

  return (
    <div className="group flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {/* Drag handle placeholder */}
        <span className="text-[#555] cursor-grab select-none text-sm leading-none">⠿</span>

        <FieldPicker
          value={condition.field}
          fields={fields}
          onChange={(f) => actions.updateCondition(condition.id, { field: f })}
        />

        <OperatorPicker
          value={condition.operator}
          fieldType={field?.attributeType ?? null}
          onChange={(op: Operator) => actions.updateCondition(condition.id, { operator: op })}
        />

        <ValueInput
          operator={condition.operator}
          field={field}
          value={condition.value}
          onChange={(v) => actions.updateCondition(condition.id, { value: v })}
        />

        {/* Row actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            title="Duplicate"
            onClick={() => actions.duplicate(condition.id)}
            className="text-[#858585] hover:text-white text-xs px-1 py-0.5 rounded hover:bg-[#2a2d2e]"
          >
            ⧉
          </button>
          <button
            type="button"
            title="Remove"
            onClick={() => actions.remove(condition.id)}
            disabled={!canRemove}
            className="text-[#858585] hover:text-[#f48771] text-xs px-1 py-0.5 rounded hover:bg-[#2a2d2e] disabled:opacity-30"
          >
            ✕
          </button>
        </div>
      </div>

      {nodeErrors.map((e) => (
        <p key={e.message} className="text-xs text-[#f48771] pl-6">
          {e.message}
        </p>
      ))}
    </div>
  );
}
