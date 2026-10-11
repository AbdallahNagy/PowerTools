import { Badge, Button, Checkbox, DataTable, Spinner, Tooltip } from "../../../shared/ui";
import { formatDateTime } from "../model/dates";
import type { DeletedRecord, RestoreStatus } from "../model/types";
import { displayName, plural, type RecordSortKey, type SortState } from "../model/view";

export const NO_VALUES_TEXT = "The audit log holds no field values for this record, so it cannot be restored.";

const resultBadge: Record<RestoreStatus, { tone: "ok" | "danger" | "neutral"; label: string }> = {
  restored: { tone: "ok", label: "Restored" },
  failed: { tone: "danger", label: "Failed" },
  skipped: { tone: "neutral", label: "Skipped" },
};

interface DeletedRecordsTableProps {
  tableName: string;
  rows: DeletedRecord[];
  filtersChanged: boolean;
  checked: ReadonlySet<string>;
  onCheck: (row: DeletedRecord, value: boolean) => void;
  onCheckAll: (value: boolean) => void;
  selectedKey: string | null;
  onSelect: (row: DeletedRecord) => void;
  sort: SortState<RecordSortKey>;
  onSort: (key: RecordSortKey) => void;
  results: ReadonlyMap<string, RestoreStatus>;
  moreRecords: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRestore: () => void;
}

export function DeletedRecordsTable({
  tableName,
  rows,
  filtersChanged,
  checked,
  onCheck,
  onCheckAll,
  selectedKey,
  onSelect,
  sort,
  onSort,
  results,
  moreRecords,
  loadingMore,
  onLoadMore,
  onRestore,
}: DeletedRecordsTableProps) {
  const selectable = rows.filter((row) => row.hasValues);
  const checkedCount = selectable.filter((row) => checked.has(row.key)).length;
  const allChecked = selectable.length > 0 && checkedCount === selectable.length;

  const columns = [
    {
      key: "check",
      width: "2.5rem",
      header: (
        <Checkbox
          aria-label="Select all records"
          checked={allChecked}
          indeterminate={checkedCount > 0 && !allChecked}
          disabled={selectable.length === 0}
          onChange={onCheckAll}
        />
      ),
      render: (row: DeletedRecord) => {
        const box = (
          <Checkbox
            aria-label={`Select ${displayName(row)}`}
            checked={checked.has(row.key)}
            disabled={!row.hasValues}
            onChange={(value) => onCheck(row, value)}
          />
        );
        return (
          <span onClick={(event) => event.stopPropagation()} className="inline-flex">
            {row.hasValues ? (
              box
            ) : (
              <Tooltip content={NO_VALUES_TEXT}>
                <span tabIndex={0} className="inline-flex">
                  {box}
                </span>
              </Tooltip>
            )}
          </span>
        );
      },
    },
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (row: DeletedRecord) =>
        row.name?.trim() ? row.name : <span className="text-fg-muted">(No name)</span>,
    },
    {
      key: "deletedOn",
      header: "Deleted On",
      sortable: true,
      render: (row: DeletedRecord) => formatDateTime(row.deletedOn),
    },
    {
      key: "deletedBy",
      header: "Deleted By",
      sortable: true,
      render: (row: DeletedRecord) =>
        row.callingUser ? (
          <span title={`Run by ${row.callingUser} as ${row.deletedBy ?? ""}`}>
            {row.deletedBy} <span className="text-xs text-fg-muted">(by {row.callingUser})</span>
          </span>
        ) : (
          row.deletedBy ?? ""
        ),
    },
    {
      key: "recordId",
      header: "Record ID",
      render: (row: DeletedRecord) => <span className="font-mono text-xs">{row.recordId}</span>,
    },
    {
      key: "result",
      header: "Result",
      render: (row: DeletedRecord) => {
        const status = results.get(row.key);
        if (!status) return null;
        const badge = resultBadge[status];
        return <Badge tone={badge.tone}>{badge.label}</Badge>;
      },
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-fg-strong">Deleted {tableName}</h2>
        <span className="text-xs text-fg-muted">{plural(rows.length, "record", "records")}</span>
        <div className="flex-1" />
        <Button variant="primary" onClick={onRestore} disabled={checkedCount === 0}>
          Restore ({checkedCount})
        </Button>
      </div>
      {filtersChanged ? (
        <p className="text-xs text-fg-muted">Filters changed. Find again to update the list.</p>
      ) : null}
      <div className="min-h-0 flex-1">
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.key}
          selectedKey={selectedKey}
          onRowClick={onSelect}
          sortKey={sort.key}
          sortDirection={sort.direction}
          onSort={(key) => onSort(key as RecordSortKey)}
          emptyMessage="No deleted records match these filters."
        />
      </div>
      {moreRecords ? (
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <Spinner size={12} /> : null}
            Load more
          </Button>
          <span className="text-xs text-fg-muted">
            Showing {plural(rows.length, "record", "records")}. More match these filters. Sorting applies to the
            loaded records only.
          </span>
        </div>
      ) : null}
    </div>
  );
}
