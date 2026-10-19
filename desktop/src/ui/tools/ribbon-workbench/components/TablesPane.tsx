import { Badge, SearchInput, cn } from "../../../shared/ui";
import { matches } from "../model/rows";
import type { TableRow } from "../state/useRibbonWorkbench";

interface TablesPaneProps {
  tables: TableRow[];
  query: string;
  onQueryChange: (value: string) => void;
  selected: string;
  onSelect: (key: string) => void;
  edited: ReadonlySet<string>;
}

export function TablesPane({ tables, query, onQueryChange, selected, onSelect, edited }: TablesPaneProps) {
  const visible = tables.filter((table) => matches(query, table.displayName, table.logicalName));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line p-2">
        <SearchInput value={query} onChange={onQueryChange} placeholder="Filter tables" aria-label="Filter tables" />
      </div>
      <ul aria-label="Tables" className="min-h-0 flex-1 overflow-auto py-1">
        {visible.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-fg-muted">{`No tables match ${query.trim()}.`}</li>
        ) : (
          visible.map((table) => {
            const isSelected = table.key === selected;
            return (
              <li key={table.key}>
                <button
                  type="button"
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => onSelect(table.key)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                    isSelected ? "bg-accent-soft text-fg-strong" : "text-fg hover:bg-hover",
                    table.ribbonNotSupported && !isSelected && "text-fg-muted",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{table.displayName}</span>
                    {table.logicalName ? (
                      <span className="truncate font-mono text-xs text-fg-muted">{table.logicalName}</span>
                    ) : null}
                  </span>
                  {edited.has(table.key) ? <Badge tone="accent">Edited</Badge> : null}
                  {table.ribbonNotSupported ? <Badge tone="neutral">No command bar</Badge> : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
