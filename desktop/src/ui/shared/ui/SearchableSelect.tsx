import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";

export type SearchableSelectOption = {
  value: string;
  label: string;
  description?: string;
  group?: string;
  disabled?: boolean;
};

export type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  loading?: boolean;
  loadingMessage?: string;
  variant?: "popover" | "inline";
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

type OptionGroup = {
  name: string | null;
  options: SearchableSelectOption[];
};

const inputClassName =
  "w-full rounded-sm border border-[var(--color-hover-bg)] bg-[var(--color-bg-dark)] px-2 py-1.5 text-sm text-[var(--color-text-gray)] placeholder:text-[var(--color-text-dark-gray)] focus:border-[var(--color-primary)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";

const optionClassName =
  "flex cursor-pointer items-baseline gap-2 px-2 py-1.5 text-left data-focus:bg-[var(--color-hover-bg)] data-selected:bg-[var(--color-bg-light)] data-disabled:cursor-not-allowed data-disabled:opacity-50";

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  disabled = false,
  emptyMessage = "No matches",
  loading = false,
  loadingMessage = "Loading…",
  variant = "popover",
  className = "",
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SearchableSelectProps) {
  if (variant === "inline") {
    return (
      <InlineSearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        searchPlaceholder={searchPlaceholder}
        disabled={disabled}
        emptyMessage={emptyMessage}
        loading={loading}
        loadingMessage={loadingMessage}
        className={className}
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
      />
    );
  }

  return (
    <PopoverSearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      disabled={disabled}
      emptyMessage={emptyMessage}
      loading={loading}
      loadingMessage={loadingMessage}
      className={className}
      id={id}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    />
  );
}

function PopoverSearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
  emptyMessage,
  loading,
  loadingMessage,
  className,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: Omit<SearchableSelectProps, "variant">) {
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => filterOptions(options, query), [options, query]);
  const groups = useMemo(() => groupOptions(filtered), [filtered]);

  return (
    <div className={`relative ${className}`}>
      <Combobox
        value={value || null}
        onChange={(next) => {
          if (next == null) return;
          onChange(next);
        }}
        onClose={() => setQuery("")}
        disabled={disabled}
        immediate
      >
        <div className="relative">
          <ComboboxInput
            id={id}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            displayValue={() => selected?.label ?? ""}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={query ? searchPlaceholder : placeholder}
            className={`${inputClassName} pr-7`}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center px-1.5 text-[var(--color-text-dark-gray)]">
            <ChevronIcon />
          </ComboboxButton>
        </div>
        <ComboboxOptions
          anchor="bottom start"
          modal={false}
          className="z-50 max-h-60 w-[var(--input-width)] overflow-auto rounded-sm border border-[var(--color-hover-bg)] bg-[var(--color-bg-darker)] py-1 shadow-lg [--anchor-gap:4px]"
        >
          <OptionListBody
            loading={loading}
            loadingMessage={loadingMessage}
            groups={groups}
            emptyMessage={emptyMessage}
            asCombobox
          />
        </ComboboxOptions>
      </Combobox>
    </div>
  );
}

function InlineSearchableSelect({
  value,
  onChange,
  options,
  searchPlaceholder,
  disabled,
  emptyMessage,
  loading,
  loadingMessage,
  className,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: Omit<SearchableSelectProps, "variant" | "placeholder">) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => filterOptions(options, query), [options, query]);
  const groups = useMemo(() => groupOptions(filtered), [filtered]);
  const enabledOptions = filtered.filter((option) => !option.disabled);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex((current) => {
      if (enabledOptions.length === 0) return 0;
      return Math.min(current, enabledOptions.length - 1);
    });
  }, [enabledOptions.length]);

  const activeOption = enabledOptions[activeIndex];
  const activeId = activeOption ? `${listId}-${activeOption.value}` : undefined;

  const selectByOffset = (offset: number) => {
    if (enabledOptions.length === 0) return;
    setActiveIndex((current) => {
      const next = current + offset;
      if (next < 0) return 0;
      if (next >= enabledOptions.length) return enabledOptions.length - 1;
      return next;
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectByOffset(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectByOffset(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      if (enabledOptions.length > 0) setActiveIndex(enabledOptions.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeOption) onChange(activeOption.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
    }
  };

  return (
    <div className={`flex min-h-0 flex-col gap-1 ${className}`}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        value={query}
        disabled={disabled}
        placeholder={searchPlaceholder}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        className={inputClassName}
      />
      <div
        id={listId}
        role="listbox"
        className="min-h-0 flex-1 overflow-auto rounded-sm border border-[var(--color-hover-bg)] bg-[var(--color-bg-darker)] py-1"
      >
        <OptionListBody
          loading={loading}
          loadingMessage={loadingMessage}
          groups={groups}
          emptyMessage={emptyMessage}
          selectedValue={value}
          activeValue={activeOption?.value}
          listId={listId}
          onSelect={onChange}
        />
      </div>
    </div>
  );
}

function OptionListBody({
  loading,
  loadingMessage,
  groups,
  emptyMessage,
  asCombobox = false,
  selectedValue,
  activeValue,
  listId,
  onSelect,
}: {
  loading: boolean;
  loadingMessage: string;
  groups: OptionGroup[];
  emptyMessage: string;
  asCombobox?: boolean;
  selectedValue?: string;
  activeValue?: string;
  listId?: string;
  onSelect?: (value: string) => void;
}) {
  if (loading) {
    return <ListMessage>{loadingMessage}</ListMessage>;
  }

  const optionCount = groups.reduce((count, group) => count + group.options.length, 0);
  if (optionCount === 0) {
    return <ListMessage>{emptyMessage}</ListMessage>;
  }

  return (
    <>
      {groups.map((group) => (
        <div
          key={group.name ?? "ungrouped"}
          role={group.name ? "group" : undefined}
          aria-label={group.name ?? undefined}
        >
          {group.name && (
            <div className="px-2 py-1 text-[10px] tracking-wider text-[var(--color-text-dark-gray)] uppercase">
              {group.name}
            </div>
          )}
          {group.options.map((option) =>
            asCombobox ? (
              <ComboboxOption
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={optionClassName}
              >
                <OptionContent option={option} />
              </ComboboxOption>
            ) : (
              <button
                key={option.value}
                id={listId ? `${listId}-${option.value}` : undefined}
                type="button"
                role="option"
                disabled={option.disabled}
                aria-selected={option.value === selectedValue}
                onClick={() => onSelect?.(option.value)}
                className={`w-full ${optionClassName} ${
                  option.value === activeValue ? "bg-[var(--color-hover-bg)]" : ""
                } ${option.value === selectedValue ? "bg-[var(--color-bg-light)]" : ""}`}
              >
                <OptionContent option={option} />
              </button>
            ),
          )}
        </div>
      ))}
    </>
  );
}

function OptionContent({ option }: { option: SearchableSelectOption }) {
  return (
    <>
      <span className="min-w-0 truncate text-sm text-[var(--color-text-gray)]">{option.label}</span>
      {option.description ? (
        <span className="min-w-0 truncate font-mono text-xs text-[var(--color-text-dark-gray)]">
          {option.description}
        </span>
      ) : null}
    </>
  );
}

function ListMessage({ children }: { children: string }) {
  return (
    <div className="px-2 py-1.5 text-sm text-[var(--color-text-dark-gray)]">{children}</div>
  );
}

function ChevronIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function filterOptions(options: SearchableSelectOption[], query: string): SearchableSelectOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) =>
    [option.label, option.description, option.value].some((part) =>
      part?.toLowerCase().includes(needle),
    ),
  );
}

function groupOptions(options: SearchableSelectOption[]): OptionGroup[] {
  const groups: OptionGroup[] = [];
  const indexByName = new Map<string | null, number>();

  for (const option of options) {
    const name = option.group ?? null;
    const existing = indexByName.get(name);
    if (existing == null) {
      indexByName.set(name, groups.length);
      groups.push({ name, options: [option] });
    } else {
      groups[existing].options.push(option);
    }
  }

  return groups;
}
