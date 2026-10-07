import { useMemo } from "react";
import { Button, DataTable, SearchInput } from "../../../shared/ui";
import type { SortState, WorkflowRow } from "../model/types";
import {
  entityLabel,
  filterWorkflows,
  modeLabel,
  nextSort,
  sortWorkflows,
  type WorkflowSortKey,
} from "../model/view";
import { ErrorLine, LoadingLine } from "./Notice";

export function WorkflowList({
  workflows,
  loading,
  errorText,
  displayNames,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  selectedId,
  onSelect,
  onRetry,
}: {
  workflows: readonly WorkflowRow[];
  loading: boolean;
  errorText: string | null;
  displayNames: ReadonlyMap<string, string>;
  filter: string;
  onFilterChange: (value: string) => void;
  sort: SortState<WorkflowSortKey>;
  onSortChange: (sort: SortState<WorkflowSortKey>) => void;
  selectedId: string | null;
  onSelect: (row: WorkflowRow) => void;
  onRetry: () => void;
}) {
  const visible = useMemo(
    () => sortWorkflows(filterWorkflows(workflows, filter, displayNames), sort, displayNames),
    [displayNames, filter, sort, workflows],
  );

  const columns = [
    { key: "name", header: "Name", sortable: true, render: (row: WorkflowRow) => row.name },
    {
      key: "entity",
      header: "Entity",
      sortable: true,
      render: (row: WorkflowRow) => {
        const label = entityLabel(row.primaryEntity, displayNames);
        return (
          <span>
            {label}
            {label !== row.primaryEntity ? (
              <span className="ml-1 text-fg-muted">{row.primaryEntity}</span>
            ) : null}
          </span>
        );
      },
    },
    { key: "mode", header: "Mode", sortable: true, render: (row: WorkflowRow) => modeLabel(row.mode) },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center border-b border-line bg-surface px-3 py-2">
        <h2 className="text-sm font-medium text-fg-strong">Workflows</h2>
      </div>
      <div className="shrink-0 p-3">
        <SearchInput value={filter} onChange={onFilterChange} placeholder="Filter workflows" />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        {loading ? (
          <LoadingLine label="Loading workflows" />
        ) : errorText ? (
          <div className="flex flex-col items-start gap-3">
            <ErrorLine>{errorText}</ErrorLine>
            <Button type="button" variant="secondary" onClick={onRetry}>Retry</Button>
          </div>
        ) : workflows.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No activated on-demand workflows in this environment.
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-fg-muted">No workflows match the filter.</p>
        ) : (
          <DataTable
            columns={columns}
            rows={visible}
            getRowKey={(row) => row.id}
            selectedKey={selectedId}
            onRowClick={onSelect}
            sortKey={sort.key}
            sortDirection={sort.direction}
            onSort={(key) => onSortChange(nextSort(sort, key as WorkflowSortKey))}
          />
        )}
      </div>
    </div>
  );
}
