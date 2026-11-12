import { useCallback, useEffect, useState } from "react";
import type { ConnectionSnapshot, PowerToolsClient } from "@powertools/sdk";
import { Alert, Button, DataTable, EmptyState, Modal, SearchInput, Spinner } from "@powertools/ui";
import { label, matches, requiredLabel, type ColumnInfo, type TableInfo } from "./types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The tab's connection: `undefined` until the host answers, `null` when none is selected. */
function useConnection(client: PowerToolsClient): ConnectionSnapshot | null | undefined {
  const [connection, setConnection] = useState<ConnectionSnapshot | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let changed = false;
    client.connection.get().then(
      (current) => {
        if (active && !changed) setConnection(current);
      },
      () => {
        if (active && !changed) setConnection(null);
      },
    );
    const unsubscribe = client.connection.onChange((next) => {
      changed = true;
      setConnection(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [client]);

  return connection;
}

export function App({ client }: { client: PowerToolsClient }) {
  const connection = useConnection(client);

  useEffect(() => {
    if (connection === null) void client.shell.setStatus(null).catch(() => undefined);
  }, [client, connection]);

  if (connection === undefined) return null;
  if (connection === null) {
    return (
      <EmptyState
        className="h-screen"
        title="No environment selected"
        description="Right-click this tab and choose Change connection."
      />
    );
  }
  // A new connection starts with a clean state.
  return <Explorer key={`${connection.kind}:${connection.displayName}`} client={client} />;
}

function Explorer({ client }: { client: PowerToolsClient }) {
  const [refreshCount, setRefreshCount] = useState(0);
  const [tables, setTables] = useState<TableInfo[] | null>(null);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [tableQuery, setTableQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnInfo[] | null>(null);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const [columnQuery, setColumnQuery] = useState("");
  const [openColumn, setOpenColumn] = useState<ColumnInfo | null>(null);

  useEffect(() => {
    let active = true;
    setTablesError(null);
    client.metadata.tables<TableInfo[]>().then(
      (result) => {
        if (!active) return;
        setTables(result);
        // A table that no longer exists cannot stay selected.
        setSelected((current) => (result.some((table) => table.logicalName === current) ? current : null));
      },
      (error: unknown) => {
        if (active) setTablesError(errorMessage(error));
      },
    );
    return () => {
      active = false;
    };
  }, [client, refreshCount]);

  useEffect(() => {
    if (selected === null) return;
    let active = true;
    setColumnsError(null);
    client.metadata.columns<ColumnInfo[]>(selected).then(
      (result) => {
        if (active) setColumns(result);
      },
      (error: unknown) => {
        if (active) setColumnsError(errorMessage(error));
      },
    );
    return () => {
      active = false;
    };
  }, [client, selected, refreshCount]);

  useEffect(() => {
    void client.shell.setStatus(tables ? `${tables.length} ${tables.length === 1 ? "table" : "tables"}` : null).catch(() => undefined);
  }, [client, tables]);

  const selectTable = useCallback((logicalName: string) => {
    setSelected(logicalName);
    setColumns(null);
    setColumnsError(null);
    setColumnQuery("");
  }, []);

  const table = tables?.find((item) => item.logicalName === selected) ?? null;
  const visibleTables = (tables ?? []).filter((item) => matches(item, tableQuery));
  const loadingTables = tables === null && tablesError === null;
  const loadingColumns = selected !== null && columns === null && columnsError === null;

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <Button variant="secondary" disabled={loadingTables || loadingColumns} onClick={() => setRefreshCount((n) => n + 1)}>
          Refresh metadata
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <section aria-label="Table list" className="flex w-[30%] min-w-56 flex-col border-r border-line bg-surface">
          <div className="flex shrink-0 flex-col gap-2 border-b border-line p-3">
            <h2 className="text-sm font-semibold text-fg-strong">Tables</h2>
            <SearchInput value={tableQuery} onChange={setTableQuery} placeholder="Search tables" aria-label="Search tables" />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {tablesError ? (
              <div className="p-3">
                <Alert tone="danger">{tablesError}</Alert>
              </div>
            ) : loadingTables ? (
              <div role="status" className="flex items-center justify-center gap-2 p-6 text-fg">
                <Spinner /> Loading tables…
              </div>
            ) : (
              <ul aria-label="Tables">
                {visibleTables.map((item) => (
                  <li key={item.logicalName}>
                    <button
                      type="button"
                      aria-current={item.logicalName === selected ? "true" : undefined}
                      onClick={() => selectTable(item.logicalName)}
                      className={`flex w-full flex-col items-start px-3 py-1.5 text-left ${
                        item.logicalName === selected ? "bg-accent text-accent-fg" : "text-fg hover:bg-hover"
                      }`}
                    >
                      <span className="w-full truncate">{label(item)}</span>
                      <span className="w-full truncate font-mono text-xs">{item.logicalName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <section aria-label="Columns" className="flex min-w-0 flex-1 flex-col bg-surface">
          {table === null ? (
            <EmptyState className="flex-1" title="Select a table to see its columns." />
          ) : (
            <>
              <div className="flex shrink-0 flex-col gap-2 border-b border-line p-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="truncate text-sm font-semibold text-fg-strong">{label(table)}</h2>
                  <span className="truncate font-mono text-xs text-fg-muted">{table.logicalName}</span>
                </div>
                <SearchInput value={columnQuery} onChange={setColumnQuery} placeholder="Search columns" aria-label="Search columns" />
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-3">
                {columnsError ? (
                  <Alert tone="danger">{columnsError}</Alert>
                ) : loadingColumns ? (
                  <div role="status" className="flex items-center justify-center gap-2 p-6 text-fg">
                    <Spinner /> Loading columns…
                  </div>
                ) : (
                  <DataTable
                    columns={[
                      {
                        key: "displayName",
                        header: "Display name",
                        render: (column: ColumnInfo) => (
                          <button type="button" className="max-w-full truncate text-left text-fg-strong hover:underline" onClick={() => setOpenColumn(column)}>
                            {label(column)}
                          </button>
                        ),
                      },
                      { key: "logicalName", header: "Logical name", render: (column: ColumnInfo) => <span className="font-mono">{column.logicalName}</span> },
                      { key: "type", header: "Type" },
                      { key: "targets", header: "Related table", render: (column: ColumnInfo) => column.targets.join(", ") },
                      { key: "requiredLevel", header: "Required", render: (column: ColumnInfo) => requiredLabel(column.requiredLevel) },
                    ]}
                    rows={(columns ?? []).filter((column) => matches(column, columnQuery))}
                    getRowKey={(column) => column.logicalName}
                    onRowClick={setOpenColumn}
                    emptyMessage="No columns match."
                  />
                )}
              </div>
            </>
          )}
        </section>
      </div>
      <Modal open={openColumn !== null} title={openColumn ? label(openColumn) : ""} onClose={() => setOpenColumn(null)}>
        {openColumn ? <ColumnDetails column={openColumn} /> : null}
      </Modal>
    </div>
  );
}

function ColumnDetails({ column }: { column: ColumnInfo }) {
  const rows: Array<[string, string]> = [
    ["Logical name", column.logicalName],
    ["Type", column.type],
    ["Required", requiredLabel(column.requiredLevel)],
    ["Origin", column.isCustom ? "Custom" : "System"],
  ];
  if (column.targets.length > 0) rows.push(["Related tables", column.targets.join(", ")]);

  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
      {rows.map(([name, value]) => (
        <div key={name} className="contents">
          <dt className="text-fg-muted">{name}</dt>
          <dd className="min-w-0 break-words text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
