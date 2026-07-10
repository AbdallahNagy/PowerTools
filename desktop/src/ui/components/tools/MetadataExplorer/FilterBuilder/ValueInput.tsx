import { useState } from "react";
import type { FieldMetadata, Operator } from "../model/types";
import { NO_VALUE_OPERATORS, MULTI_VALUE_OPERATORS } from "../model/operators";

interface ValueInputProps {
  operator: Operator | null;
  field: FieldMetadata | null;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}

export function ValueInput({ operator, field, value, onChange }: ValueInputProps) {
  const [multiRaw, setMultiRaw] = useState("");

  if (!operator || !field) {
    return <div className="w-40 shrink-0" />;
  }

  if (NO_VALUE_OPERATORS.includes(operator)) {
    return null;
  }

  if (MULTI_VALUE_OPERATORS.includes(operator)) {
    const selected = Array.isArray(value) ? value : [];

    if (field.optionSet) {
      return (
        <select
          multiple
          value={selected}
          onChange={(e) =>
            onChange(Array.from(e.target.selectedOptions, (o) => o.value))
          }
          className="w-40 shrink-0 bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm px-2 py-1 text-sm text-[#cccccc] focus:outline-none focus:border-[#007fd4] h-20"
        >
          {field.optionSet.map((o) => (
            <option key={o.value} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <div className="w-40 shrink-0 flex flex-col gap-1">
        <div className="flex gap-1">
          <input
            type="text"
            value={multiRaw}
            onChange={(e) => setMultiRaw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && multiRaw.trim()) {
                onChange([...selected, multiRaw.trim()]);
                setMultiRaw("");
              }
            }}
            placeholder="Type and press Enter to add…"
            className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm px-2 py-1 text-sm text-[#cccccc] focus:outline-none focus:border-[#007fd4]"
          />
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 bg-[#1e2d3c] text-[#007fd4] text-xs px-1.5 py-0.5 rounded"
              >
                {v}
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((x) => x !== v))}
                  className="hover:text-white"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  const strValue = typeof value === "string" ? value : "";

  // Choice / boolean: render a select
  if (field.optionSet) {
    return (
      <select
        value={strValue}
        onChange={(e) => onChange(e.target.value)}
        className="w-40 shrink-0 bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm px-2 py-1 text-sm text-[#cccccc] focus:outline-none focus:border-[#007fd4]"
      >
        <option value="" disabled>Select…</option>
        {field.optionSet.map((o) => (
          <option key={o.value} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  // DateTime
  if (field.attributeType === "DateTime") {
    return (
      <input
        type="date"
        value={strValue}
        onChange={(e) => onChange(e.target.value)}
        className="w-40 shrink-0 bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm px-2 py-1 text-sm text-[#cccccc] focus:outline-none focus:border-[#007fd4]"
      />
    );
  }

  // Number types
  if (["Integer", "BigInt", "Decimal", "Double", "Money"].includes(field.attributeType)) {
    return (
      <input
        type="number"
        value={strValue}
        onChange={(e) => onChange(e.target.value)}
        className="w-40 shrink-0 bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm px-2 py-1 text-sm text-[#cccccc] focus:outline-none focus:border-[#007fd4]"
      />
    );
  }

  // Default: text
  return (
    <input
      type="text"
      value={strValue}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value…"
      className="w-40 shrink-0 bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm px-2 py-1 text-sm text-[#cccccc] focus:outline-none focus:border-[#007fd4]"
    />
  );
}
