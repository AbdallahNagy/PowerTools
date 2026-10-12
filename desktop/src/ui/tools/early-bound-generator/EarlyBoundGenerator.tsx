import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Code2 } from "lucide-react";
import { useTabConnection } from "../../shared/connections";
import { useToolStatus } from "../../shared/status";
import {
  Alert,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Input,
  SearchInput,
  Spinner,
  ToastProvider,
  useToast,
} from "../../shared/ui";
import { generateCode, useTables } from "./api/earlyBoundApi";
import { toEarlyBoundError } from "./model/apiError";
import type { GenerateResponse, TableSummary } from "./model/types";
import { DEFAULT_NAMESPACE, filterTables, isValidNamespace, setSelection } from "./model/view";

const noEnvironmentMessage = "Right-click this tab and choose Change connection.";

const tableCount = (count: number) => (count === 1 ? "1 table" : `${count} tables`);

export default function EarlyBoundGenerator() {
  return (
    <ToastProvider>
      <EarlyBoundGeneratorPage />
    </ToastProvider>
  );
}

function EarlyBoundGeneratorPage() {
  const { connectionName } = useTabConnection();
  const { showToast } = useToast();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [namespace, setNamespace] = useState(DEFAULT_NAMESPACE);
  const [result, setResult] = useState<GenerateResponse | null>(null);

  const tablesQuery = useTables(connectionName || null);
  const tables = useMemo(() => tablesQuery.data?.tables ?? [], [tablesQuery.data]);
  const visible = useMemo(() => filterTables(tables, filter), [tables, filter]);

  const generate = useMutation({
    mutationFn: () =>
      generateCode(connectionName ?? "", {
        namespace: namespace.trim(),
        tables: [...selected],
      }),
    onSuccess: (data) => setResult(data),
    onError: (error) => showToast(toEarlyBoundError(error), "error"),
  });

  useEffect(() => {
    setFilter("");
    setSelected(new Set());
    setResult(null);
  }, [connectionName]);

  const namespaceValid = isValidNamespace(namespace);
  const canGenerate = !!connectionName && selected.size > 0 && namespaceValid && !generate.isPending;

  const status = useMemo(() => {
    if (!connectionName) return "No environment selected";
    if (tablesQuery.isFetching) return "Loading tables…";
    if (tablesQuery.isError) return "Could not load tables";
    if (generate.isPending) return `Generating ${tableCount(selected.size)}…`;
    if (result) return `Generated ${tableCount(result.tableCount)}`;
    return `${selected.size} of ${tables.length} tables selected`;
  }, [connectionName, generate.isPending, result, selected.size, tables.length, tablesQuery.isError, tablesQuery.isFetching]);
  useToolStatus(status);

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.code);
      showToast("Code copied.", "success");
    } catch {
      showToast("Could not copy the code.", "error");
    }
  };

  const save = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.code], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = result.fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-line bg-surface px-3 py-2">
        <Field
          label="Namespace"
          className="w-64"
          error={namespaceValid ? undefined : "Use a C# namespace, for example Contoso.Model."}
        >
          <Input
            value={namespace}
            onChange={(event) => setNamespace(event.target.value)}
            disabled={!connectionName}
            spellCheck={false}
          />
        </Field>
        <Button type="button" disabled={!canGenerate} onClick={() => generate.mutate()}>
          {generate.isPending ? "Generating…" : "Generate"}
        </Button>
        <Button type="button" variant="secondary" disabled={!result} onClick={() => void copy()}>
          Copy
        </Button>
        <Button type="button" variant="secondary" disabled={!result} onClick={save}>
          Save as .cs
        </Button>
      </div>
      <Group orientation="horizontal" className="flex min-h-0 flex-1">
        <Panel defaultSize="35%" minSize="20%" className="flex min-h-0 min-w-0 flex-col bg-surface">
          <TablesPane
            connectionName={connectionName ?? ""}
            loading={tablesQuery.isFetching}
            errorText={tablesQuery.isError ? toEarlyBoundError(tablesQuery.error) : null}
            tables={tables}
            visible={visible}
            filter={filter}
            onFilterChange={setFilter}
            selected={selected}
            onToggle={(name, checked) => setSelected((current) => setSelection(current, [name], checked))}
            onSelectShown={() =>
              setSelected((current) => setSelection(current, visible.map((table) => table.logicalName), true))
            }
            onClear={() => setSelected(new Set())}
            onRefresh={() => void tablesQuery.refetch()}
          />
        </Panel>
        <Separator
          aria-label="Resize panes"
          className="w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent"
        />
        <Panel minSize="30%" className="flex min-h-0 min-w-0 flex-col bg-surface">
          {result ? (
            <pre
              aria-label="Generated code"
              className="m-0 min-h-0 flex-1 overflow-auto bg-canvas p-3 font-mono text-xs text-fg"
            >
              {result.code}
            </pre>
          ) : (
            <EmptyState
              icon={Code2}
              title="No code yet"
              description="Tick the tables you need, then choose Generate. You get one C# file with a class per table and an enum per choice column."
              className="flex-1"
            />
          )}
        </Panel>
      </Group>
    </div>
  );
}

function TablesPane({
  connectionName,
  loading,
  errorText,
  tables,
  visible,
  filter,
  onFilterChange,
  selected,
  onToggle,
  onSelectShown,
  onClear,
  onRefresh,
}: {
  connectionName: string;
  loading: boolean;
  errorText: string | null;
  tables: TableSummary[];
  visible: TableSummary[];
  filter: string;
  onFilterChange: (value: string) => void;
  selected: ReadonlySet<string>;
  onToggle: (logicalName: string, checked: boolean) => void;
  onSelectShown: () => void;
  onClear: () => void;
  onRefresh: () => void;
}) {
  if (!connectionName) {
    return <p className="p-3 text-fg-muted">{noEnvironmentMessage}</p>;
  }

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2 border-b border-line p-3">
        <SearchInput value={filter} onChange={onFilterChange} placeholder="Filter tables" />
        <div className="flex items-center gap-2">
          <span className="flex-1 text-xs text-fg-muted">
            {selected.size} of {tables.length} selected
          </span>
          <Button type="button" variant="ghost" size="sm" disabled={visible.length === 0} onClick={onSelectShown}>
            Select shown
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={selected.size === 0} onClick={onClear}>
            Clear
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={onRefresh}>
            Refresh
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div role="status" aria-label="Loading tables" className="p-3">
            <Spinner />
          </div>
        ) : errorText ? (
          <Alert
            tone="danger"
            className="m-3"
            action={
              <Button type="button" variant="secondary" onClick={onRefresh}>
                Retry
              </Button>
            }
          >
            {errorText}
          </Alert>
        ) : visible.length === 0 ? (
          <p className="p-3 text-fg-muted">
            {tables.length === 0 ? "No tables in this environment." : "No tables match this filter."}
          </p>
        ) : (
          <ul aria-label="Tables">
            {visible.map((table) => (
              <li key={table.logicalName}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-hover">
                  <Checkbox
                    checked={selected.has(table.logicalName)}
                    onChange={(checked) => onToggle(table.logicalName, checked)}
                    aria-label={table.displayName}
                  />
                  <span className="min-w-0 flex-1 truncate text-fg">{table.displayName}</span>
                  <span className="truncate font-mono text-xs text-fg-muted">{table.logicalName}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
