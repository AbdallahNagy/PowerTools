import type { FieldMetadata } from "../model/types";

interface FieldPickerProps {
  value: string | null;
  fields: FieldMetadata[];
  onChange: (logicalName: string) => void;
}

export function FieldPicker({ value, fields, onChange }: FieldPickerProps) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 min-w-0 bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm px-2 py-1 text-sm text-[#cccccc] focus:outline-none focus:border-[#007fd4]"
    >
      <option value="" disabled>
        Select field…
      </option>
      {fields.map((f) => (
        <option key={f.logicalName} value={f.logicalName}>
          {f.displayName} ({f.logicalName})
        </option>
      ))}
    </select>
  );
}
