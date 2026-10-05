import { useEffect, useRef, type KeyboardEvent } from "react";
import { Button, SearchInput, Spinner } from "../../../shared/ui";
import { displayLabel, filterTables, tablesCountLabel } from "../model/search";
import type { TableInfo } from "../model/types";

interface TablesPaneProps {
  hasConnection: boolean;
  tables: TableInfo[];
  loading: boolean;
  errorText: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  selectedName: string | null;
  onSelect: (logicalName: string) => void;
  onRetry: () => void;
}

export function TablesPane({
  hasConnection,
  tables,
  loading,
  errorText,
  query,
  onQueryChange,
  selectedName,
  onSelect,
  onRetry,
}: TablesPaneProps) {
  const searchRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const visible = filterTables(tables, query);

  useEffect(() => {
    if (hasConnection) searchRef.current?.querySelector("input")?.focus();
  }, [hasConnection]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (visible.length === 0) return;
    event.preventDefault();
    const current = visible.findIndex((table) => table.logicalName === selectedName);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = current === -1 ? (step === 1 ? 0 : visible.length - 1) : current + step;
    const target = visible[next];
    if (!target) return;
    onSelect(target.logicalName);
    const buttons = Array.from(listRef.current?.querySelectorAll("button") ?? []);
    buttons.find((button) => button.dataset.logicalName === target.logicalName)?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--color-border-dark)] p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--color-text-white)]">Tables</h2>
          {tables.length > 0 ? (
            <span className="text-xs text-[var(--color-text-dark-gray)]">
              {tablesCountLabel(visible.length, tables.length)}
            </span>
          ) : null}
        </div>
        <fieldset disabled={!hasConnection} className="m-0 min-w-0 border-0 p-0">
          <div ref={searchRef}>
            <SearchInput
              value={query}
              onChange={onQueryChange}
              placeholder="Search by display or logical name"
            />
          </div>
        </fieldset>
      </div>
      <div ref={listRef} onKeyDown={onKeyDown} className="min-h-0 flex-1 overflow-auto">
        {!hasConnection ? (
          <p className="p-3 text-[var(--color-text-dark-gray)]">
            Right-click this tab and choose Change connection.
          </p>
        ) : loading ? (
          <div role="status" aria-label="Loading tables" className="flex items-center justify-center gap-2 p-6">
            <Spinner />
            <span className="text-[var(--color-text-gray)]">Loading tables…</span>
          </div>
        ) : errorText ? (
          <div className="flex flex-col items-start gap-3 p-3">
            <p role="alert" className="text-[var(--color-text-gray)]">{errorText}</p>
            <Button type="button" variant="secondary" onClick={onRetry}>Retry</Button>
          </div>
        ) : visible.length === 0 ? (
          <p className="p-3 text-[var(--color-text-dark-gray)]">
            {tables.length === 0 ? "No tables found." : `No tables match "${query.trim()}".`}
          </p>
        ) : (
          <ul aria-label="Tables">
            {visible.map((table) => {
              const selected = table.logicalName === selectedName;
              return (
                <li key={table.logicalName}>
                  <button
                    type="button"
                    data-logical-name={table.logicalName}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onSelect(table.logicalName)}
                    className={`flex w-full flex-col items-start px-3 py-1.5 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)] ${
                      selected
                        ? "bg-[var(--color-primary)] text-[var(--color-text-white)]"
                        : "text-[var(--color-text-gray)] hover:bg-[var(--color-hover-bg)]"
                    }`}
                  >
                    <span className="w-full truncate">{displayLabel(table)}</span>
                    <span
                      className={`w-full truncate font-mono text-xs ${
                        selected ? "text-[var(--color-text-white)]" : "text-[var(--color-text-dark-gray)]"
                      }`}
                    >
                      {table.logicalName}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
