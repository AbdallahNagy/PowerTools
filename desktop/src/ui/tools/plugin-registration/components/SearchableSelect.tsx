import { useEffect, useMemo, useRef, useState } from "react";
import { useExclusiveOpen } from "./exclusiveSelect";
import { fieldClass } from "./formStyles";

export interface SearchableOption {
  id: string;
  label: string;
  unavailable?: boolean;
}

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled = false,
  emptyLabel = "No matches",
}: {
  label: string;
  value: string;
  options: SearchableOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useExclusiveOpen();
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return options;
    return options.filter((option) => option.label.toLocaleLowerCase().includes(term));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("mousedown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("mousedown", close, true);
    };
  }, [open, setOpen]);

  return (
    <div className="flex flex-col gap-1 text-xs tracking-wider text-[#858585]">
      <span>{label}</span>
      <div ref={root} className="relative">
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          className={`${fieldClass} text-left truncate`}
          onClick={() => {
            setQuery("");
            setOpen(!open);
          }}
        >
          {selected ? `${selected.label}${selected.unavailable ? " (unavailable)" : ""}` : placeholder}
        </button>
        {open ? (
          <div className="absolute z-20 mt-1 w-full rounded-sm border border-[#3c3c3c] bg-[var(--color-bg-darker)] shadow-lg">
            <input
              aria-label={`Search ${label.toLowerCase()}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              className={`${fieldClass} border-0 border-b rounded-none`}
              autoFocus
            />
            <ul role="listbox" aria-label={label} className="max-h-48 overflow-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-2 py-1.5 text-sm text-[#858585]">{emptyLabel}</li>
              ) : filtered.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.id === value}
                    className={`w-full px-2 py-1.5 text-left text-sm hover:bg-[var(--color-hover-bg)] ${
                      option.id === value ? "text-[var(--color-text-white)] bg-[var(--color-hover-bg)]" : "text-[var(--color-text-gray)]"
                    }`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onChange(option.id);
                      setOpen(false);
                    }}
                  >
                    {option.label}{option.unavailable ? " (unavailable)" : ""}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SearchableMultiSelect({
  label,
  values,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  values: string[];
  options: SearchableOption[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useExclusiveOpen();
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const selected = new Set(values);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return options;
    return options.filter((option) => option.label.toLocaleLowerCase().includes(term));
  }, [options, query]);
  const summary = values.length === 0
    ? "None selected"
    : values.length === options.length && options.length > 0
      ? "All attributes"
      : `${values.length} selected`;

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("mousedown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("mousedown", close, true);
    };
  }, [open, setOpen]);

  return (
    <div className="flex flex-col gap-1 text-xs tracking-wider text-[#858585]">
      <span>{label}</span>
      <div ref={root} className="relative">
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          disabled={disabled}
          className={`${fieldClass} text-left truncate`}
          onClick={() => {
            setQuery("");
            setOpen(!open);
          }}
        >
          {summary}
        </button>
        {open ? (
          <div className="absolute z-20 mt-1 w-full rounded-sm border border-[#3c3c3c] bg-[var(--color-bg-darker)] shadow-lg">
            <input
              aria-label={`Search ${label.toLowerCase()}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              className={`${fieldClass} border-0 border-b rounded-none`}
              autoFocus
            />
            <ul className="max-h-48 overflow-auto py-1">
              {filtered.map((option) => {
                const checked = selected.has(option.id);
                return (
                  <li key={option.id}>
                    <label className="flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--color-text-gray)] hover:bg-[var(--color-hover-bg)]">
                      <input
                        type="checkbox"
                        aria-label={option.label}
                        checked={checked}
                        disabled={disabled}
                        onChange={() => {
                          onChange(checked
                            ? values.filter((value) => value !== option.id)
                            : [...values, option.id]);
                        }}
                      />
                      {option.label}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
