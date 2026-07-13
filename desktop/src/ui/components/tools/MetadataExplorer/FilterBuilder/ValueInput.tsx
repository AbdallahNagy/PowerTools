import { useState } from "react";
import type { FieldMetadata, FilterCondition, Operator } from "../model/types";
import { NO_VALUE_OPERATORS, MULTI_VALUE_OPERATORS } from "../model/operators";
import { LookupPickerModal, type SelectedLookupRecord } from "./LookupPickerModal";

interface ValueInputProps {
  operator: Operator | null;
  field: FieldMetadata | null;
  value: string | string[] | undefined;
  valueLabels?: Record<string, string>;
  lookupTarget?: string;
  onChange: (v: string | string[]) => void;
  onConditionChange: (patch: Partial<Omit<FilterCondition, "id" | "kind">>) => void;
}

const LOOKUP_TYPES = new Set(["Lookup", "Owner", "Customer"]);

export function ValueInput({
  operator,
  field,
  value,
  valueLabels,
  lookupTarget,
  onChange,
  onConditionChange,
}: ValueInputProps) {
  const [multiRaw, setMultiRaw] = useState("");
  const [lookupOpen, setLookupOpen] = useState(false);

  if (!operator || !field) {
    return <div className="w-40 shrink-0" />;
  }

  if (NO_VALUE_OPERATORS.includes(operator)) {
    return null;
  }

  if (MULTI_VALUE_OPERATORS.includes(operator)) {
    const selected = Array.isArray(value) ? value : [];

    if (LOOKUP_TYPES.has(field.attributeType)) {
      const selectedRecords: SelectedLookupRecord[] = selected.map((id) => ({
        id,
        name: valueLabels?.[id] ?? id,
        target: lookupTarget ?? field.targets?.[0] ?? "",
      }));

      return (
        <div className="w-56 shrink-0 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setLookupOpen(true)}
            className="flex items-center justify-between gap-2 bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm px-2 py-1 text-sm text-[#cccccc] hover:border-[#007fd4] focus:outline-none focus:border-[#007fd4]"
          >
            <span className="truncate text-[#858585]">
              {selected.length ? `${selected.length} selected` : "Select records..."}
            </span>
            <SearchIcon />
          </button>
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selected.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 bg-[#1e2d3c] text-[#9cdcfe] text-xs px-1.5 py-0.5 rounded max-w-48"
                  title={v}
                >
                  <span className="truncate">{valueLabels?.[v] ?? v}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextLabels = { ...(valueLabels ?? {}) };
                      delete nextLabels[v];
                      onConditionChange({
                        value: selected.filter((x) => x !== v),
                        valueLabels: nextLabels,
                      });
                    }}
                    className="hover:text-white"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <LookupPickerModal
            open={lookupOpen}
            mode="multiple"
            field={field}
            initialTarget={lookupTarget}
            selectedRecords={selectedRecords}
            onClose={() => setLookupOpen(false)}
            onApply={(records) => {
              const lastRecord = records[records.length - 1];
              onConditionChange({
                value: records.map((record) => record.id),
                valueLabels: Object.fromEntries(records.map((record) => [record.id, record.name])),
                lookupTarget: lastRecord?.target ?? lookupTarget,
              });
              setLookupOpen(false);
            }}
          />
        </div>
      );
    }

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
            placeholder="Enter value..."
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

  if (LOOKUP_TYPES.has(field.attributeType)) {
    const displayValue = strValue ? valueLabels?.[strValue] ?? strValue : "";

    return (
      <div className="relative w-56 shrink-0">
        <input
          type="text"
          value={displayValue}
          readOnly
          placeholder="Select record..."
          title={strValue}
          className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm pl-2 pr-8 py-1 text-sm text-[#cccccc] placeholder-[#858585] focus:outline-none focus:border-[#007fd4]"
        />
        <button
          type="button"
          title="Search records"
          onClick={() => setLookupOpen(true)}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-[#858585] hover:text-white rounded hover:bg-[#2a2d2e]"
        >
          <SearchIcon />
        </button>
        <LookupPickerModal
          open={lookupOpen}
          mode="single"
          field={field}
          initialTarget={lookupTarget}
          onClose={() => setLookupOpen(false)}
          onSelect={(record) => {
            onConditionChange({
              value: record.id,
              valueLabels: { [record.id]: record.name },
              lookupTarget: record.target,
            });
            setLookupOpen(false);
          }}
        />
      </div>
    );
  }

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

function SearchIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
