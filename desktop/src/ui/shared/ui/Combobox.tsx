import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Popover } from "radix-ui";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown } from "lucide-react";
import { useFieldControl } from "./useFieldControl";
import { comboboxOptionText, filterComboboxOptions, type ComboboxOption } from "./comboboxFilter";
import { cn } from "./cn";

const ROW_HEIGHT = 28;
const VIRTUALIZE_AFTER = 100;
const PAGE_SIZE = 10;

type Row =
  | { kind: "group"; label: string }
  | { kind: "option"; option: ComboboxOption; index: number };

interface ComboboxProps {
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  /** Shown when no option is selected. */
  placeholder?: string;
  disabled?: boolean;
  /** Shown in the list when nothing matches the typed text. */
  emptyMessage?: string;
  id?: string;
  className?: string;
  onBlur?: () => void;
  "aria-label"?: string;
}

/**
 * Select with type-to-filter. The control is a text input: click or type to
 * open the list, then every typed word narrows it. Use it for long lists such
 * as tables, columns, or messages; keep `Select` for short fixed lists.
 */
export function Combobox({
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled = false,
  emptyMessage = "No matches.",
  id,
  className,
  onBlur,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const field = useFieldControl();
  const listId = useId();
  const optionIdPrefix = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Null until the user types after opening, so the list starts unfiltered.
  const [query, setQuery] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(-1);

  const selected = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);
  const selectedText = selected ? comboboxOptionText(selected) : "";
  const matches = useMemo(() => filterComboboxOptions(options, query ?? ""), [options, query]);
  const rows = useMemo(() => toRows(matches), [matches]);
  const rowIndexByOption = useMemo(() => {
    const indexes: number[] = [];
    rows.forEach((row, rowIndex) => {
      if (row.kind === "option") indexes[row.index] = rowIndex;
    });
    return indexes;
  }, [rows]);

  const openList = () => {
    if (disabled || open) return;
    setOpen(true);
    setQuery(null);
    const selectedIndex = options.findIndex((option) => option.value === value);
    setHighlighted(selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled));
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const closeList = () => {
    setOpen(false);
    setQuery(null);
  };

  const choose = (option: ComboboxOption | undefined) => {
    if (!option || option.disabled) return;
    closeList();
    if (option.value !== value) onChange(option.value);
  };

  const move = (step: number) => {
    const last = matches.length - 1;
    if (last < 0) return;
    let next = Math.min(last, Math.max(0, highlighted + step));
    while (matches[next]?.disabled) {
      next += Math.sign(step);
      if (next < 0 || next > last) return;
    }
    setHighlighted(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!open) {
          openList();
          return;
        }
        move(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      case "PageDown":
      case "PageUp":
        if (!open) return;
        event.preventDefault();
        move(event.key === "PageDown" ? PAGE_SIZE : -PAGE_SIZE);
        return;
      case "Enter":
        if (!open) return;
        event.preventDefault();
        choose(matches[highlighted]);
        return;
      case "Escape":
        if (!open) return;
        event.preventDefault();
        event.stopPropagation();
        closeList();
        return;
      case "Tab":
        if (open) closeList();
        return;
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={(next) => (next ? openList() : closeList())}>
      <Popover.Anchor asChild>
        <div ref={anchorRef} className={cn("relative", className)}>
          <input
            {...field}
            id={id ?? field.id}
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={
              open && highlighted >= 0 && matches[highlighted] ? `${optionIdPrefix}-${highlighted}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            title={selectedText || undefined}
            placeholder={open && query !== null ? selectedText || placeholder : placeholder}
            value={open && query !== null ? query : selectedText}
            onChange={(event) => {
              const next = event.target.value;
              if (!open) setOpen(true);
              setQuery(next);
              const firstEnabled = filterComboboxOptions(options, next).findIndex((option) => !option.disabled);
              setHighlighted(firstEnabled);
            }}
            onClick={openList}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              closeList();
              onBlur?.();
            }}
            className={cn(
              "w-full truncate rounded-sm border border-line bg-canvas pl-2 pr-7 py-1.5 text-sm text-fg",
              "placeholder:text-fg-muted focus:outline-none focus:border-focus",
              "aria-[invalid=true]:border-danger",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          />
          <ChevronDown
            size={14}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
            aria-hidden="true"
          />
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (anchorRef.current?.contains(event.target as Node)) event.preventDefault();
          }}
          // Keep focus in the input while the pointer works the list.
          onMouseDown={(event) => event.preventDefault()}
          className={cn(
            "z-[100] w-[max(var(--radix-popover-trigger-width),22rem)] max-w-[calc(100vw-16px)]",
            "rounded-sm border border-line bg-raised text-sm text-fg shadow-lg",
          )}
        >
          <ComboboxList
            listId={listId}
            optionIdPrefix={optionIdPrefix}
            label={ariaLabel ?? "Options"}
            rows={rows}
            highlightedRow={highlighted >= 0 ? (rowIndexByOption[highlighted] ?? -1) : -1}
            highlighted={highlighted}
            selectedValue={value}
            emptyMessage={emptyMessage}
            onHighlight={setHighlighted}
            onChoose={(index) => choose(matches[index])}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function toRows(options: ComboboxOption[]): Row[] {
  const rows: Row[] = [];
  let group: string | undefined;
  options.forEach((option, index) => {
    if (option.group && option.group !== group) rows.push({ kind: "group", label: option.group });
    group = option.group;
    rows.push({ kind: "option", option, index });
  });
  return rows;
}

function ComboboxList({
  listId,
  optionIdPrefix,
  label,
  rows,
  highlightedRow,
  highlighted,
  selectedValue,
  emptyMessage,
  onHighlight,
  onChoose,
}: {
  listId: string;
  optionIdPrefix: string;
  label: string;
  rows: Row[];
  highlightedRow: number;
  highlighted: number;
  selectedValue: string;
  emptyMessage: string;
  onHighlight: (index: number) => void;
  onChoose: (index: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualize = rows.length > VIRTUALIZE_AFTER;
  const optionCount = useMemo(() => rows.filter((row) => row.kind === "option").length, [rows]);
  const virtualizer = useVirtualizer({
    count: virtualize ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // Long names wrap, so rows are measured rather than a fixed height.
    indexAttribute: "data-row",
    overscan: 10,
  });
  const measureRow = virtualize ? virtualizer.measureElement : undefined;

  useEffect(() => {
    if (highlightedRow < 0) return;
    if (virtualize) {
      virtualizer.scrollToIndex(highlightedRow, { align: "auto" });
      return;
    }
    scrollRef.current
      ?.querySelector(`[data-row="${highlightedRow}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [highlightedRow, virtualize, virtualizer]);

  const renderRow = (row: Row, rowIndex: number, style?: CSSProperties) => {
    if (row.kind === "group") {
      return (
        <div
          key={`group-${rowIndex}`}
          role="presentation"
          data-row={rowIndex}
          ref={measureRow}
          style={style}
          className="flex items-end px-2 pb-1 pt-2 text-xs font-medium text-fg-muted"
        >
          {row.label}
        </div>
      );
    }
    const { option, index } = row;
    const isSelected = option.value === selectedValue;
    return (
      <div
        key={`option-${option.value}-${index}`}
        id={`${optionIdPrefix}-${index}`}
        role="option"
        aria-label={option.description ? comboboxOptionText(option) : undefined}
        aria-selected={isSelected}
        aria-disabled={option.disabled || undefined}
        aria-setsize={virtualize ? optionCount : undefined}
        aria-posinset={virtualize ? index + 1 : undefined}
        data-row={rowIndex}
        ref={measureRow}
        style={style}
        onMouseMove={() => {
          if (!option.disabled && index !== highlighted) onHighlight(index);
        }}
        onClick={() => onChoose(index)}
        className={cn(
          "flex cursor-pointer select-none flex-wrap items-baseline gap-x-2 rounded-sm px-2 py-1",
          index === highlighted && "bg-hover",
          isSelected && "text-accent-text font-medium",
          option.disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className="min-w-0 break-words">{option.label}</span>
        {option.description ? (
          <span className="ml-auto min-w-0 break-all font-mono text-xs text-fg-muted">{option.description}</span>
        ) : null}
      </div>
    );
  };

  return (
    <div
      ref={scrollRef}
      id={listId}
      role="listbox"
      aria-label={label}
      className="max-h-72 overflow-auto p-1"
    >
      {rows.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-fg-muted">{emptyMessage}</p>
      ) : virtualize ? (
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) =>
            renderRow(rows[item.index]!, item.index, {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${item.start}px)`,
            }),
          )}
        </div>
      ) : (
        rows.map((row, rowIndex) => renderRow(row, rowIndex))
      )}
    </div>
  );
}
