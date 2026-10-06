import { DataTable, SearchInput, Spinner, Button } from "../../../shared/ui";
import { attributeTypeLabel, relatedTablesText } from "../model/attributeType";
import { requiredLevelLabel } from "../model/requiredLevel";
import { displayLabel, fieldsCountLabel } from "../model/search";
import { isSortKey, type SortKey, type SortState } from "../model/sort";
import type { AttributeInfo, TableInfo } from "../model/types";
import { CopyButton } from "./CopyButton";

interface FieldsPaneProps {
  hasConnection: boolean;
  table: TableInfo | null;
  /** Fields already filtered and sorted for the grid. */
  fields: AttributeInfo[];
  totalFields: number;
  loading: boolean;
  errorText: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  sort: SortState;
  onSort: (key: SortKey) => void;
  onOpenField: (field: AttributeInfo) => void;
  onRetry: () => void;
}

export function FieldsPane({
  hasConnection,
  table,
  fields,
  totalFields,
  loading,
  errorText,
  query,
  onQueryChange,
  sort,
  onSort,
  onOpenField,
  onRetry,
}: FieldsPaneProps) {
  if (!hasConnection) {
    return (
      <p className="p-3 text-fg-muted">
        Right-click this tab and choose Change connection.
      </p>
    );
  }

  if (!table) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-fg-muted">Select a table to see its fields.</p>
      </div>
    );
  }

  const columns = [
    {
      key: "displayName",
      header: "Display name",
      sortable: true,
      render: (field: AttributeInfo) => (
        <button
          type="button"
          onClick={() => onOpenField(field)}
          className={`max-w-full truncate text-left hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-focus ${
            field.displayName?.trim()
              ? "text-fg-strong"
              : "text-fg-muted"
          }`}
        >
          {displayLabel(field)}
        </button>
      ),
    },
    {
      key: "logicalName",
      header: "Logical name",
      sortable: true,
      render: (field: AttributeInfo) => <span className="font-mono">{field.logicalName}</span>,
    },
    {
      key: "type",
      header: "Type",
      sortable: true,
      render: (field: AttributeInfo) => attributeTypeLabel(field),
    },
    {
      key: "relatedTable",
      header: "Related table",
      sortable: true,
      render: (field: AttributeInfo) => {
        const text = relatedTablesText(field);
        return text ? (
          <span className="block max-w-[16rem] truncate" title={text}>
            {text}
          </span>
        ) : null;
      },
    },
    {
      key: "required",
      header: "Required",
      sortable: true,
      render: (field: AttributeInfo) => (
        <span className={field.requiredLevel === "None" ? "text-fg-muted" : ""}>
          {requiredLevelLabel(field.requiredLevel)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-line p-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate text-sm font-semibold text-fg-strong">
              {displayLabel(table)}
            </h2>
            <span className="truncate font-mono text-xs text-fg-muted">
              {table.logicalName}
            </span>
            <CopyButton value={table.logicalName} label="Copy logical name" />
          </div>
          {!loading && !errorText ? (
            <span className="shrink-0 text-xs text-fg-muted">
              {fieldsCountLabel(fields.length, totalFields)}
            </span>
          ) : null}
        </div>
        <SearchInput
          value={query}
          onChange={onQueryChange}
          placeholder="Search fields by display or logical name"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading ? (
          <div role="status" aria-label="Loading fields" className="flex items-center justify-center gap-2 p-6">
            <Spinner />
            <span className="text-fg">Loading fields…</span>
          </div>
        ) : errorText ? (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-fg">{errorText}</p>
            <Button type="button" variant="secondary" onClick={onRetry}>Retry</Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={fields}
            getRowKey={(field) => field.logicalName}
            onRowClick={onOpenField}
            sortKey={sort.key}
            sortDirection={sort.direction}
            onSort={(key) => {
              if (isSortKey(key)) onSort(key);
            }}
            emptyMessage={
              totalFields === 0 ? "This table has no fields." : `No fields match "${query.trim()}".`
            }
          />
        )}
      </div>
    </div>
  );
}
