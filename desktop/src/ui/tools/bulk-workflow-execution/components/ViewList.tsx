import { useMemo } from "react";
import { Button, DataTable, SearchInput } from "../../../shared/ui";
import type { SortState, ViewRow, WorkflowRow } from "../model/types";
import { filterViews, nextSort, sortViews, viewKindLabel, type ViewSortKey } from "../model/view";
import { ErrorLine, LoadingLine } from "./Notice";

export function ViewList({
  workflow,
  entityName,
  views,
  loading,
  errorText,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  selectedId,
  onSelect,
  onRetry,
}: {
  workflow: WorkflowRow | null;
  entityName: string;
  views: readonly ViewRow[];
  loading: boolean;
  errorText: string | null;
  filter: string;
  onFilterChange: (value: string) => void;
  sort: SortState<ViewSortKey>;
  onSortChange: (sort: SortState<ViewSortKey>) => void;
  selectedId: string | null;
  onSelect: (row: ViewRow) => void;
  onRetry: () => void;
}) {
  const visible = useMemo(() => sortViews(filterViews(views, filter), sort), [filter, sort, views]);

  const columns = [
    { key: "name", header: "Name", sortable: true, render: (row: ViewRow) => row.name },
    { key: "type", header: "Type", sortable: true, render: (row: ViewRow) => viewKindLabel(row.kind) },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-baseline gap-2 border-b border-line bg-surface px-3 py-2">
        <h2 className="text-sm font-medium text-fg-strong">Views</h2>
        {workflow ? (
          <span className="truncate text-sm text-fg">
            {workflow.name} <span className="text-fg-muted">· {entityName}</span>
          </span>
        ) : null}
      </div>
      {!workflow ? (
        <p className="p-3 text-sm text-fg-muted">Select a workflow to see its views.</p>
      ) : (
        <>
          <div className="shrink-0 p-3">
            <SearchInput value={filter} onChange={onFilterChange} placeholder="Filter views" />
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
            {loading ? (
              <LoadingLine label="Loading views" />
            ) : errorText ? (
              <div className="flex flex-col items-start gap-3">
                <ErrorLine>{errorText}</ErrorLine>
                <Button type="button" variant="secondary" onClick={onRetry}>Retry</Button>
              </div>
            ) : views.length === 0 ? (
              <p className="text-sm text-fg-muted">
                No views for {entityName}. Paste FetchXML below.
              </p>
            ) : (
              <DataTable
                columns={columns}
                rows={visible}
                getRowKey={(row) => `${row.kind}:${row.id}`}
                selectedKey={selectedId}
                onRowClick={onSelect}
                emptyMessage="No views match the filter."
                sortKey={sort.key}
                sortDirection={sort.direction}
                onSort={(key) => onSortChange(nextSort(sort, key as ViewSortKey))}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
