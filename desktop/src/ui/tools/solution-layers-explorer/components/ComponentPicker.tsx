import type { ReactNode } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Combobox,
  DataTable,
  EmptyState,
  Field,
  SearchInput,
  Select,
  Spinner,
  Toolbar,
} from "../../../shared/ui";
import type { EntityInfo } from "../../../shared/contracts/dataverse";
import type { ComponentRow, ComponentTypeInfo } from "../model/types";
import type { ComponentSortKey, SortState } from "../model/view";

export type TableMode = "none" | "required" | "optional";

interface ComponentPickerProps {
  disabled: boolean;
  /** Shown in place of the results, for example when no environment is selected. */
  placeholder: ReactNode | null;
  types: ComponentTypeInfo[];
  componentType: number | null;
  onComponentTypeChange: (componentType: number) => void;
  tableMode: TableMode;
  tables: EntityInfo[];
  entity: string;
  onEntityChange: (entity: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  rows: ComponentRow[];
  truncated: boolean;
  sort: SortState<ComponentSortKey>;
  onSort: (key: ComponentSortKey) => void;
  selectedId: string | null;
  onSelect: (row: ComponentRow) => void;
  checked: ReadonlyMap<string, ComponentRow>;
  onCheck: (row: ComponentRow, checked: boolean) => void;
  onCheckAll: (checked: boolean) => void;
  onBulkRemove: () => void;
}

export function ComponentPicker({
  disabled,
  placeholder,
  types,
  componentType,
  onComponentTypeChange,
  tableMode,
  tables,
  entity,
  onEntityChange,
  search,
  onSearchChange,
  loading,
  error,
  onRetry,
  rows,
  truncated,
  sort,
  onSort,
  selectedId,
  onSelect,
  checked,
  onCheck,
  onCheckAll,
  onBulkRemove,
}: ComponentPickerProps) {
  const checkedVisible = rows.filter((row) => checked.has(row.componentId)).length;
  const allChecked = rows.length > 0 && checkedVisible === rows.length;
  const someChecked = checkedVisible > 0 && !allChecked;
  const searchDisabled = disabled || (tableMode === "required" && !entity);

  const columns = [
    {
      key: "check",
      width: "2.5rem",
      header: (
        <Checkbox
          checked={allChecked}
          indeterminate={someChecked}
          disabled={disabled || rows.length === 0}
          onChange={onCheckAll}
          aria-label="Select all components"
        />
      ),
      render: (row: ComponentRow) => (
        <span onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={checked.has(row.componentId)}
            onChange={(value) => onCheck(row, value)}
            aria-label={`Select ${row.name || row.logicalName}`}
          />
        </span>
      ),
    },
    { key: "name", header: "Name", sortable: true, render: (row: ComponentRow) => row.name },
    {
      key: "logicalName",
      header: "Logical Name",
      sortable: true,
      render: (row: ComponentRow) => <span className="font-mono text-xs">{row.logicalName}</span>,
    },
    {
      key: "parentEntity",
      header: "Table",
      sortable: true,
      render: (row: ComponentRow) => <span className="font-mono text-xs">{row.parentEntity ?? ""}</span>,
    },
  ];

  let body: ReactNode;
  if (placeholder) {
    body = placeholder;
  } else if (error) {
    body = (
      <Alert
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    );
  } else if (tableMode === "required" && !entity) {
    body = <EmptyState title="Choose a table to search its columns." />;
  } else if (loading) {
    body = (
      <div className="flex flex-1 items-center justify-center p-6" role="status" aria-label="Searching components">
        <Spinner size={20} />
      </div>
    );
  } else {
    body = (
      <>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.componentId}
          selectedKey={selectedId}
          onRowClick={onSelect}
          sortKey={sort.key}
          sortDirection={sort.direction}
          onSort={(key) => onSort(key as ComponentSortKey)}
          emptyMessage="No matching components"
          className="min-h-0"
        />
        {truncated ? (
          <p className="text-xs text-fg-muted">Showing the first 50 matches. Refine the search to narrow the list.</p>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <Toolbar aria-label="Component search" className="flex-col items-stretch">
        <div className="flex w-full flex-col gap-2">
          <Field label="Component type">
            <Select
              value={componentType === null ? "" : String(componentType)}
              disabled={disabled || types.length === 0}
              onChange={(event) => onComponentTypeChange(Number(event.target.value))}
            >
              {types.map((type) => (
                <option key={type.componentType} value={type.componentType}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>
          {tableMode !== "none" ? (
            <Field label="Table">
              <Combobox
                value={entity}
                options={[
                  ...(tableMode === "required" ? [] : [{ value: "", label: "All tables" }]),
                  ...tables.map((table) => ({
                    value: table.logicalName,
                    label: table.displayName,
                    description: table.logicalName,
                  })),
                ]}
                placeholder="Choose a table"
                emptyMessage="No tables match."
                disabled={disabled}
                onChange={onEntityChange}
              />
            </Field>
          ) : null}
          <fieldset disabled={searchDisabled} className="m-0 min-w-0 border-0 p-0 disabled:opacity-50">
            <SearchInput
              value={search}
              onChange={onSearchChange}
              placeholder="Search by name"
              aria-label="Search by name"
            />
          </fieldset>
        </div>
      </Toolbar>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        {body}
      </div>
      <div className="flex shrink-0 justify-end border-t border-line px-3 py-2">
        <Button variant="danger" size="sm" disabled={disabled || checked.size === 0} onClick={onBulkRemove}>
          Remove Active layers ({checked.size})
        </Button>
      </div>
    </div>
  );
}
