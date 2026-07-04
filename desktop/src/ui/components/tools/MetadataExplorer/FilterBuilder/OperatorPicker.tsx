import type { FieldType, Operator } from "../model/types";
import { getOperatorsForType } from "../model/operators";

interface OperatorPickerProps {
  value: Operator | null;
  fieldType: FieldType | null;
  onChange: (op: Operator) => void;
}

export function OperatorPicker({ value, fieldType, onChange }: OperatorPickerProps) {
  const options = fieldType ? getOperatorsForType(fieldType) : [];

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value as Operator)}
      disabled={!fieldType}
      className="w-44 shrink-0 bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm px-2 py-1 text-sm text-[#cccccc] focus:outline-none focus:border-[#007fd4] disabled:opacity-40"
    >
      <option value="" disabled>
        Operator…
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
