import { useMemo, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useTabConnection } from "../../shared/connections";
import { useToolStatus } from "../../shared/status";
import { Alert, Button, EmptyState, Spinner, ToastProvider, useToast } from "../../shared/ui";
import {
  restoreRecords,
  useAttributes,
  useDeletedRecords,
  useRecordValues,
  useStatus,
  useTables,
  useUsers,
} from "./api/recycleBinApi";
import { DeletedRecordsTable } from "./components/DeletedRecordsTable";
import { FilterBar } from "./components/FilterBar";
import { RecordDetails } from "./components/RecordDetails";
import { RestoreDialog, type RestorePhase } from "./components/RestoreDialog";
import { SourceLine } from "./components/SourceLine";
import { defaultRange, isRangeValid } from "./model/dates";
import { isPermissionError, readErrorText, restoreDetail, toRecycleBinError } from "./model/faults";
import {
  chunk,
  latestDeletions,
  orderForRestore,
  repeatedRecordCount,
  toRestoreItem,
} from "./model/restoreBatches";
import { sourceFor, sourceLine } from "./model/sourceChoice";
import type { AppliedSearch, DeletedRecord, RestoreEntry, RestoreStatus, Source } from "./model/types";
import { displayName, nextSort, plural, restoreSummary, sortRecords, type RecordSortKey, type SortState } from "./model/view";

export default function RecycleBin() {
  return (
    <ToastProvider>
      <RecycleBinTool />
    </ToastProvider>
  );
}

/** Every tab follows its environment; a new environment starts the page again from scratch. */
function RecycleBinTool() {
  const { connectionName } = useTabConnection();
  return <RecycleBinPage key={connectionName ?? ""} connectionName={connectionName || null} />;
}

interface RestoreRun {
  source: Source;
  tableName: string;
  rows: DeletedRecord[];
  repeated: number;
  phase: RestorePhase;
  entries: RestoreEntry[];
  stopping: boolean;
}

function NoEnvironment() {
  return (
    <EmptyState
      title="Select an environment"
      description="Choose an environment in the connection control at the bottom of the sidebar."
    />
  );
}

function RecycleBinPage({ connectionName }: { connectionName: string | null }) {
  const { showToast } = useToast();
  const initialRange = useMemo(() => defaultRange(), []);

  const [table, setTable] = useState("");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [deletedBy, setDeletedBy] = useState("");
  const [applied, setApplied] = useState<AppliedSearch | null>(null);
  const [sort, setSort] = useState<SortState<RecordSortKey>>({ key: "deletedOn", direction: "desc" });
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
  const [selected, setSelected] = useState<DeletedRecord | null>(null);
  const [results, setResults] = useState<ReadonlyMap<string, RestoreStatus>>(() => new Map());
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [run, setRun] = useState<RestoreRun | null>(null);
  const stopRequested = useRef(false);

  const statusQuery = useStatus(connectionName);
  const tablesQuery = useTables(connectionName);
  const usersQuery = useUsers(connectionName);
  const tables = useMemo(() => tablesQuery.data?.tables ?? [], [tablesQuery.data]);
  const users = useMemo(
    () => [...(usersQuery.data?.users ?? [])].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [usersQuery.data],
  );
  const chosenTable = tables.find((item) => item.logicalName === table) ?? null;
  const source = sourceFor(chosenTable);

  const appliedTable = tables.find((item) => item.logicalName === applied?.table) ?? null;
  const deletedQuery = useDeletedRecords(connectionName, applied);
  const loaded = useMemo(
    () => deletedQuery.data?.pages.flatMap((page) => page.records) ?? [],
    [deletedQuery.data],
  );
  const rows = useMemo(() => sortRecords(loaded, sort), [loaded, sort]);
  const moreRecords = deletedQuery.hasNextPage;

  const recordQuery = useRecordValues(connectionName, applied?.source ?? null, selected);
  const attributesQuery = useAttributes(connectionName, selected?.table ?? null);

  const rangeValid = isRangeValid(from, to);
  const rangeError = source !== "bin" && from && to && from > to ? "To must be on or after From." : null;
  const canFind = !!connectionName && !!source && (source === "bin" || rangeValid);
  const filtersChanged =
    applied !== null &&
    (applied.table !== table ||
      applied.source !== source ||
      (source === "audit" && (applied.from !== from || applied.to !== to || applied.deletedBy !== deletedBy)));

  const listsLoading = tablesQuery.isLoading || usersQuery.isLoading || statusQuery.isLoading;
  const searching = deletedQuery.isFetching && !deletedQuery.isFetchingNextPage;

  const status = (() => {
    if (!connectionName) return "No environment selected";
    if (run?.phase === "running") return `Restoring records: ${run.entries.length} of ${run.rows.length}`;
    if (listsLoading) return "Loading tables…";
    if (searching) return "Finding deleted records…";
    if (selected && recordQuery.isFetching) return "Loading field values…";
    if (restoreStatus) return restoreStatus;
    if (applied && deletedQuery.data) return plural(loaded.length, "deleted record", "deleted records");
    return null;
  })();
  useToolStatus(status);

  const find = () => {
    if (!canFind || !source) return;
    setApplied((current) => ({ id: (current?.id ?? 0) + 1, source, table, from, to, deletedBy }));
    setChecked(new Set());
    setSelected(null);
    setResults(new Map());
    setRestoreStatus(null);
  };

  const check = (row: DeletedRecord, value: boolean) => {
    setChecked((current) => {
      const next = new Set(current);
      if (value) next.add(row.key);
      else next.delete(row.key);
      return next;
    });
  };

  const checkAll = (value: boolean) => {
    setChecked(value ? new Set(rows.filter((row) => row.hasValues).map((row) => row.key)) : new Set());
  };

  const openRestore = () => {
    if (!applied || !appliedTable) return;
    const chosen = rows.filter((row) => row.hasValues && checked.has(row.key));
    const repeated = repeatedRecordCount(chosen);
    const latest = latestDeletions(chosen).rows;
    setRun({
      source: applied.source,
      tableName: appliedTable.displayName || appliedTable.logicalName,
      rows: orderForRestore(applied.source, latest),
      repeated,
      phase: "confirm",
      entries: [],
      stopping: false,
    });
  };

  const runRestore = async () => {
    if (!run || !connectionName) return;
    const current = run;
    stopRequested.current = false;
    setRun({ ...current, phase: "running" });
    const entries: RestoreEntry[] = [];
    for (const batch of chunk(current.rows)) {
      if (stopRequested.current) break;
      try {
        const response = await restoreRecords(connectionName, current.source, batch.map(toRestoreItem));
        batch.forEach((row, index) => {
          const result = response.results[index];
          entries.push(
            result
              ? { key: row.key, name: displayName(row), status: result.status, detail: restoreDetail(result) }
              : { key: row.key, name: displayName(row), status: "failed", detail: "No result was returned." },
          );
        });
      } catch (error) {
        const message = toRecycleBinError(error).message;
        for (const row of batch) entries.push({ key: row.key, name: displayName(row), status: "failed", detail: message });
      }
      const snapshot = [...entries];
      setRun((existing) => (existing ? { ...existing, entries: snapshot } : existing));
    }
    setRun((existing) => (existing ? { ...existing, phase: "done", stopping: false } : existing));
  };

  const finishRestore = () => {
    if (!run) return;
    const summary = restoreSummary(run.entries);
    setResults((current) => {
      const next = new Map(current);
      for (const entry of run.entries) next.set(entry.key, entry.status);
      return next;
    });
    setChecked((current) => {
      const next = new Set(current);
      for (const entry of run.entries) if (entry.status !== "failed") next.delete(entry.key);
      return next;
    });
    setRestoreStatus(`${summary.restored} restored, ${summary.failed} failed`);
    if (summary.failed > 0) {
      showToast(`${summary.failed} of ${run.rows.length} records could not be restored.`, "error");
    } else if (run.entries.length > 0) {
      showToast(`${summary.restored} records restored.`, "success");
    }
    setRun(null);
  };

  const filterBar = (
    <FilterBar
      disabled={!connectionName}
      loading={!!connectionName && listsLoading}
      tables={tables}
      table={table}
      onTableChange={setTable}
      source={source}
      from={from}
      to={to}
      onFromChange={setFrom}
      onToChange={setTo}
      rangeError={rangeError}
      users={users}
      deletedBy={deletedBy}
      onDeletedByChange={setDeletedBy}
      canFind={canFind}
      onFind={find}
    />
  );

  let content;
  if (!connectionName) {
    content = <NoEnvironment />;
  } else if (tablesQuery.isError) {
    content = (
      <div className="p-3">
        <Alert
          tone="danger"
          action={
            <Button variant="secondary" size="sm" onClick={() => void tablesQuery.refetch()}>
              Try again
            </Button>
          }
        >
          {readErrorText(tablesQuery.error, null)}
        </Alert>
      </div>
    );
  } else if (tablesQuery.data && tables.length === 0) {
    content = (
      <EmptyState
        title="No tables have the recycle bin or auditing turned on in this environment."
        description="Turn on the recycle bin, or auditing for the environment and the table, then refresh."
        action={
          <Button variant="ghost" size="sm" aria-label="Reload tables" onClick={() => void tablesQuery.refetch()}>
            <RotateCw size={14} aria-hidden="true" />
          </Button>
        }
      />
    );
  } else {
    content = (
      <Group orientation="horizontal" className="flex min-h-0 flex-1">
        <Panel id="rb-records" defaultSize="58%" minSize="35%" className="flex min-h-0 min-w-0 flex-col bg-surface">
          {recordsPane()}
        </Panel>
        <Separator
          aria-label="Resize panes"
          className="w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent"
        />
        <Panel id="rb-details" minSize="25%" className="flex min-h-0 min-w-0 flex-col bg-surface">
          {detailsPane()}
        </Panel>
      </Group>
    );
  }

  function recordsPane() {
    if (!applied || !appliedTable) {
      return <EmptyState title="Choose a table and a date range, then find deleted records." />;
    }
    if (deletedQuery.isError && !deletedQuery.data) {
      return (
        <div className="p-3">
          {isPermissionError(deletedQuery.error) ? (
            <Alert tone="danger">{readErrorText(deletedQuery.error, applied.source)}</Alert>
          ) : (
            <Alert
              tone="danger"
              action={
                <Button variant="secondary" size="sm" onClick={() => void deletedQuery.refetch()}>
                  Try again
                </Button>
              }
            >
              {readErrorText(deletedQuery.error, applied.source)}
            </Alert>
          )}
        </div>
      );
    }
    if (!deletedQuery.data) {
      return (
        <div className="flex flex-1 items-center justify-center" role="status" aria-label="Finding deleted records">
          <Spinner size={24} />
        </div>
      );
    }
    return (
      <>
        <DeletedRecordsTable
          tableName={appliedTable.displayName || appliedTable.logicalName}
          rows={rows}
          filtersChanged={filtersChanged}
          checked={checked}
          onCheck={check}
          onCheckAll={checkAll}
          selectedKey={selected?.key ?? null}
          onSelect={setSelected}
          sort={sort}
          onSort={(key) => setSort((current) => nextSort(current, key))}
          results={results}
          moreRecords={moreRecords}
          loadingMore={deletedQuery.isFetchingNextPage}
          onLoadMore={() => void deletedQuery.fetchNextPage()}
          onRestore={openRestore}
        />
        {deletedQuery.isFetchNextPageError ? (
          <div className="px-3 pb-3">
            <Alert
              tone="danger"
              action={
                <Button variant="secondary" size="sm" onClick={() => void deletedQuery.fetchNextPage()}>
                  Try again
                </Button>
              }
            >
              {readErrorText(deletedQuery.error, applied.source)}
            </Alert>
          </div>
        ) : null}
      </>
    );
  }

  function detailsPane() {
    if (!selected || !applied) {
      return <EmptyState title="Select a deleted record to see the values it had." />;
    }
    return (
      <RecordDetails
        key={selected.key}
        record={selected}
        source={applied.source}
        fields={recordQuery.data?.fields}
        attributes={attributesQuery.data}
        loading={recordQuery.isLoading}
        error={recordQuery.isError ? readErrorText(recordQuery.error, applied.source) : null}
        onRetry={() => void recordQuery.refetch()}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {filterBar}
      {chosenTable && source && connectionName ? (
        <SourceLine line={sourceLine(source, chosenTable, statusQuery.data)} />
      ) : null}
      {content}
      {run ? (
        <RestoreDialog
          source={run.source}
          tableName={run.tableName}
          rows={run.rows}
          repeated={run.repeated}
          phase={run.phase}
          entries={run.entries}
          stopping={run.stopping}
          onCancel={() => setRun(null)}
          onConfirm={() => void runRestore()}
          onStop={() => {
            stopRequested.current = true;
            setRun((existing) => (existing ? { ...existing, stopping: true } : existing));
          }}
          onDone={finishRestore}
        />
      ) : null}
    </div>
  );
}
