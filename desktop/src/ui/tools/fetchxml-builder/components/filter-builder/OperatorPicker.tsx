import type { FieldType, Operator } from "../../model/types";
import { getOperatorsForType } from "../../model/operators";
import { Select } from "../../../../shared/ui";

interface OperatorPickerProps {
  value: Operator | null;
  fieldType: FieldType | null;
  onChange: (op: Operator) => void;
}

export function OperatorPicker({ value, fieldType, onChange }: OperatorPickerProps) {
  const options = fieldType ? getOperatorsForType(fieldType) : [];

  return (
    <Select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value as Operator)}
      disabled={!fieldType}
      className="w-36 shrink-0 [&>select]:py-1"
    >
      <option value="" disabled>
        Operator…
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
