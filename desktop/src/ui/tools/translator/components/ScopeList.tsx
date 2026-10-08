import { useEffect, useRef, type KeyboardEvent } from "react";
import { Alert, Badge, Button, SearchInput, Spinner, cn } from "../../../shared/ui";
import { filterTables } from "../model/grid";
import { GLOBAL_SCOPE } from "../model/labels";
import type { TableInfo } from "../model/types";

interface ScopeListProps {
  hasConnection: boolean;
  loading: boolean;
  errorText: string | null;
  onRetry: () => void;
  tables: readonly TableInfo[];
  globalCount: number | null;
  query: string;
  onQueryChange: (value: string) => void;
  selected: string | null;
  onSelect: (scope: string) => void;
  editsByScope: ReadonlyMap<string, number>;
}

function EditBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return <Badge tone="accent">{count} edited</Badge>;
}

export function ScopeList({
  hasConnection,
  loading,
  errorText,
  onRetry,
  tables,
  globalCount,
  query,
  onQueryChange,
  selected,
  onSelect,
  editsByScope,
}: ScopeListProps) {
  const searchRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const visible = filterTables(tables, query);
  const ready = hasConnection && !loading && !errorText;

  useEffect(() => {
    if (ready) searchRef.current?.querySelector("input")?.focus();
  }, [ready]);

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (visible.length === 0) return;
    event.preventDefault();
    const current = visible.findIndex((table) => table.logicalName === selected);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = current === -1 ? (step === 1 ? 0 : visible.length - 1) : current + step;
    const target = visible[next];
    if (!target) return;
    onSelect(target.logicalName);
    const buttons = Array.from(listRef.current?.querySelectorAll("button") ?? []);
    buttons.find((button) => button.dataset.scope === target.logicalName)?.focus();
  };

  if (!hasConnection) return null;

  if (loading) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center gap-2 p-6">
        <Spinner />
        <span className="text-fg">Loading languages and tables…</span>
      </div>
    );
  }

  if (errorText) {
    return (
      <div className="p-3">
        <Alert
          tone="danger"
          action={
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
          }
        >
          {errorText}
        </Alert>
      </div>
    );
  }

  const globalSelected = selected === GLOBAL_SCOPE;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-line p-3">
        <button
          type="button"
          data-scope={GLOBAL_SCOPE}
          aria-current={globalSelected ? "true" : undefined}
          onClick={() => onSelect(GLOBAL_SCOPE)}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left",
            "focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus",
            globalSelected ? "bg-accent-soft text-fg-strong" : "text-fg hover:bg-hover",
          )}
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate">Global choices</span>
            {globalCount != null ? <span className="text-xs text-fg-muted">{globalCount}</span> : null}
          </span>
          <EditBadge count={editsByScope.get(GLOBAL_SCOPE)} />
        </button>
        <div ref={searchRef}>
          <SearchInput
            value={query}
            onChange={onQueryChange}
            placeholder="Search tables by display or logical name"
            aria-label="Search tables"
          />
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-fg-strong">Tables</h2>
          <span className="text-xs text-fg-muted">
            {visible.length === tables.length ? tables.length : `${visible.length} of ${tables.length}`}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {visible.length === 0 ? (
          <p className="p-3 text-fg-muted">
            {tables.length === 0 ? "No tables found." : `No tables match "${query.trim()}".`}
          </p>
        ) : (
          <ul ref={listRef} aria-label="Tables" onKeyDown={onKeyDown}>
            {visible.map((table) => {
              const isSelected = table.logicalName === selected;
              return (
                <li key={table.logicalName}>
                  <button
                    type="button"
                    data-scope={table.logicalName}
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => onSelect(table.logicalName)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left",
                      "focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus",
                      isSelected ? "bg-accent-soft text-fg-strong" : "text-fg hover:bg-hover",
                    )}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{table.displayName || table.logicalName}</span>
                      <span className="truncate font-mono text-2xs text-fg-muted">{table.logicalName}</span>
                    </span>
                    <EditBadge count={editsByScope.get(table.logicalName)} />
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
