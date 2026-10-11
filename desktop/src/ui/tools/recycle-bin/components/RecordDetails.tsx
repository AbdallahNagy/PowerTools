import { useMemo, useState } from "react";
import { Alert, Button, DataTable, EmptyState, SearchInput, Spinner } from "../../../shared/ui";
import { formatDateTime } from "../model/dates";
import { fieldRows, filterFields, type FieldRow } from "../model/fields";
import type { AttributeInfo, DeletedRecord, FieldValue, Source } from "../model/types";
import { displayName, nextSort, sortFields, type FieldSortKey, type SortState } from "../model/view";

const AUDIT_NOTE =
  "These are the values recorded in the audit log when the record was deleted. Only audited fields that had a value appear here, and only these are restored.";
const BIN_NOTE = "These are the values the record had when it was deleted. Restoring brings all of them back.";

interface RecordDetailsProps {
  record: DeletedRecord;
  source: Source;
  fields: FieldValue[] | undefined;
  attributes: AttributeInfo[] | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const columns = [
  { key: "displayName", header: "Display Name", sortable: true },
  {
    key: "logicalName",
    header: "Name",
    sortable: true,
    render: (row: FieldRow) => <span className="font-mono text-xs">{row.logicalName}</span>,
  },
  {
    key: "value",
    header: "Value",
    render: (row: FieldRow) => <span title={row.raw}>{row.value}</span>,
  },
];

export function RecordDetails({ record, source, fields, attributes, loading, error, onRetry }: RecordDetailsProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState<FieldSortKey>>({ key: "displayName", direction: "asc" });
  const rows = useMemo(
    () => sortFields(filterFields(fieldRows(fields ?? [], attributes), search), sort),
    [fields, attributes, search, sort],
  );

  const deleted = [
    record.deletedOn ? `Deleted ${formatDateTime(record.deletedOn)}` : "Deleted",
    record.deletedBy ? `by ${record.deletedBy}` : "",
  ].filter(Boolean).join(" ");

  let body;
  if (source === "audit" && !record.hasValues) {
    body = <EmptyState title="The audit log holds no field values for this record, so it cannot be restored." />;
  } else if (error) {
    body = (
      <Alert
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        {error}
      </Alert>
    );
  } else if (loading || !fields) {
    body = (
      <div className="flex flex-1 items-center justify-center" role="status" aria-label="Loading field values">
        <Spinner size={24} />
      </div>
    );
  } else {
    body = (
      <>
        <SearchInput value={search} onChange={setSearch} placeholder="Filter fields" aria-label="Filter fields" />
        <div className="min-h-0 flex-1">
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.logicalName}
            sortKey={sort.key}
            sortDirection={sort.direction}
            onSort={(key) => setSort((current) => nextSort(current, key as FieldSortKey))}
            emptyMessage={fields.length === 0 ? "No field values were recorded." : "No fields match the filter."}
          />
        </div>
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div>
        <h2 className="text-base font-semibold text-fg-strong">{displayName(record)}</h2>
        <p className="text-xs text-fg-muted">
          {record.table} · <span className="font-mono">{record.recordId}</span> · {deleted}
        </p>
      </div>
      <Alert tone="info">{source === "bin" ? BIN_NOTE : AUDIT_NOTE}</Alert>
      {body}
    </div>
  );
}
