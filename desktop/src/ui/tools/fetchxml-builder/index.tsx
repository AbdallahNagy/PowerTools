import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { usePrimaryAction } from "../../shared/keyboard";
import { Button, Combobox, Field, Spinner, ToastProvider, useToast, type ComboboxOption } from "../../shared/ui";
import type { EntityInfo } from "../../shared/contracts/dataverse";
import { useConnections, useTabConnection } from "../../shared/connections";
import type { EntityView, FetchResult } from "./model/types";
import { FilterTree } from "./components/filter-builder/FilterTree";
import { ResultsGrid } from "./components/ResultsGrid";
import { FetchXmlView } from "./components/FetchXmlView";
import { ColumnsBar } from "./components/ColumnsBar";
import { ColumnPickerModal } from "./components/ColumnPickerModal";
import { FetchXmlBuilderProvider } from "./context/FetchXmlBuilderProvider";
import { useFilterTree } from "./hooks/useFilterTree";
import { useTables } from "./hooks/useTables";
import { useTableMetadata } from "./hooks/useTableMetadata";
import { useEntityRelationships } from "./hooks/useEntityRelationships";
import { useRunFetch } from "./hooks/useRunFetch";
import { useEntityViews } from "./hooks/useEntityViews";
import { knownColumns } from "./model/columns";
import { parseViewFilters } from "./model/viewFilters";
import { buildFetchXml } from "./model/fetchxml";
import { validateTree } from "./model/validation";

type RightView = "results" | "fetchxml";

export { default as FetchXmlBuilderIcon } from "./fetchxml-builder-icon.svg";

export default function FetchXmlBuilder() {
  return (
    <ToastProvider>
      <FetchXmlBuilderPage />
    </ToastProvider>
  );
}

function FetchXmlBuilderPage() {
  const { connectionId } = useTabConnection();
  const [selectedEntity, setSelectedEntity] = useState<EntityInfo | null>(null);
  const [page, setPage] = useState(1);
  const [pagingCookies, setPagingCookies] = useState<Record<number, string>>({});
  const [lastFetchXml, setLastFetchXml] = useState("");
  const [validationErrors, setValidationErrors] = useState<ReturnType<typeof validateTree>>([]);
  const [rightView, setRightView] = useState<RightView>("results");
  // null means the table's default view columns.
  const [chosenColumns, setChosenColumns] = useState<string[] | null>(null);
  const [selectedViewId, setSelectedViewId] = useState("");
  const [runColumns, setRunColumns] = useState<string[]>([]);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const { showToast } = useToast();
  const { connections } = useConnections();
  const tree = useFilterTree();
  const { data: tables, isLoading: tablesLoading, error: tablesError } = useTables(connectionId || null);
  const { data: fields, isLoading: fieldsLoading } = useTableMetadata(
    selectedEntity?.logicalName ?? null,
    connectionId || null,
  );
  const { data: relationships } = useEntityRelationships(
    selectedEntity?.logicalName ?? null,
    connectionId || null,
  );
  const {
    data: views,
    isLoading: viewsLoading,
    error: viewsError,
  } = useEntityViews(selectedEntity?.logicalName ?? null, connectionId || null);
  const { mutate: runFetch, data: result, isPending, reset: resetResult } = useRunFetch(connectionId || null);

  const sortedTables = useMemo(
    () => [...(tables ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [tables],
  );
  const tableOptions = useMemo<ComboboxOption[]>(
    () =>
      sortedTables.map((table) => ({
        value: table.logicalName,
        label: table.displayName,
        description: table.logicalName,
      })),
    [sortedTables],
  );

  const defaultViewFields = useMemo(
    () => (fields ?? []).filter((field) => field.isInDefaultView).map((field) => field.logicalName),
    [fields],
  );
  const columns = chosenColumns ?? defaultViewFields;
  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === connectionId) ?? null,
    [connections, connectionId],
  );

  const handleSelectEntity = (entity: EntityInfo | null) => {
    setSelectedEntity(entity);
    tree.reset();
    resetResult();
    setPage(1);
    setPagingCookies({});
    setValidationErrors([]);
    setLastFetchXml("");
    setChosenColumns(null);
    setSelectedViewId("");
    setRunColumns([]);
  };
  const resetForConnection = useRef(handleSelectEntity);
  resetForConnection.current = handleSelectEntity;
  const appliedConnection = useRef(connectionId);

  useEffect(() => {
    if (appliedConnection.current === connectionId) return;
    appliedConnection.current = connectionId;
    resetForConnection.current(null);
  }, [connectionId]);

  const handleEntityChange = (logicalName: string) => {
    const entity = sortedTables.find((e) => e.logicalName === logicalName) ?? null;
    handleSelectEntity(entity);
  };

  const handleRun = (targetPage = 1, runWith = columns, filterRoot = tree.root) => {
    const errors = validateTree(filterRoot);
    setValidationErrors(errors);
    if (errors.length > 0) {
      showToast("Fix validation errors before running.", "error");
      return;
    }
    if (!selectedEntity) return;

    const fetchXml = buildFetchXml(selectedEntity.logicalName, filterRoot, runWith);
    setLastFetchXml(fetchXml);
    setRunColumns(runWith);
    setPage(targetPage);

    runFetch(
      {
        fetchXml,
        page: targetPage,
        pageSize: 50,
        pagingCookie: pagingCookies[targetPage - 1],
        returnTotalRecordCount: true,
      },
      {
        onSuccess: (res: FetchResult) => {
          if (res.pagingCookie) {
            setPagingCookies((prev) => ({ ...prev, [targetPage]: res.pagingCookie! }));
          }
        },
        onError: (err) => showToast((err as Error).message, "error"),
      },
    );
  };

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1) return;
    handleRun(nextPage);
  };

  // Changing columns reruns a query that already has results, so the grid shows them at once.
  const applyColumns = (next: string[], filterRoot = tree.root) => {
    setChosenColumns(next);
    setPagingCookies({});
    if (result && !isPending) handleRun(1, next, filterRoot);
  };

  // A view replaces both the columns and the filters; the filters stay editable.
  const handleSelectView = (view: EntityView) => {
    const { root, skipped } = parseViewFilters(view.fetchXml, {
      fields: fields ?? [],
      relationships: relationships ?? [],
      tables: tables ?? [],
    });
    tree.load(root);
    setValidationErrors([]);
    setSelectedViewId(view.id);
    applyColumns(knownColumns(view.columns, fields ?? []), root);
    if (skipped.length > 0) {
      showToast(`Some of the view's filters could not be loaded: ${skipped.join("; ")}.`, "info");
    }
  };

  const handleRemoveColumn = (column: string) => {
    applyColumns(columns.filter((name) => name !== column));
  };

  const handleClearAll = () => {
    tree.reset();
    resetResult();
    setPage(1);
    setPagingCookies({});
    setValidationErrors([]);
    setLastFetchXml("");
    setChosenColumns(null);
    setSelectedViewId("");
    setRunColumns([]);
  };

  const canRun = !!selectedEntity && !!connectionId && !fieldsLoading && !isPending;
  usePrimaryAction({
    label: "Run",
    enabled: canRun,
    run: () => handleRun(1),
  });
  const resultData: FetchResult | null = result ?? null;

  return (
    <FetchXmlBuilderProvider connectionId={connectionId || null} tables={tables ?? []}>
      <div className="flex flex-col flex-1 min-h-0 p-4 gap-4 text-fg overflow-hidden">
      {/* Top bar */}
      <div className="flex items-end gap-4 flex-wrap">
        <div className="ml-auto flex items-center gap-2">
          <Button variant="primary" onClick={() => handleRun(1)} disabled={!canRun} className="text-sm py-1.5">
            {isPending ? "Running…" : "Run"}
          </Button>
        </div>
      </div>

      {/* Main layout: 50/50 split */}
      <Group className="flex flex-1 min-h-0">
        {/* Left: entity selector + filters */}
        <Panel defaultSize="50%" minSize="30%" className="flex flex-col min-h-0 min-w-0 gap-3 overflow-hidden">
          {/* Entity selection */}
          <Field label="Table" className="shrink-0 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Combobox
                value={selectedEntity?.logicalName ?? ""}
                options={tableOptions}
                onChange={handleEntityChange}
                disabled={!connectionId || tablesLoading}
                placeholder={
                  !connectionId
                    ? "— select a connection first —"
                    : tablesLoading
                      ? "Loading tables…"
                      : "— select a table —"
                }
                emptyMessage="No tables match."
                className="w-72 shrink-0 [&>input]:bg-raised"
              />
              {tablesLoading && <Spinner size={14} />}
              <Button variant="ghost" onClick={handleClearAll} className="text-xs py-1 px-2 shrink-0 ml-auto">
                Clear all
              </Button>
            </div>
            {tablesError && (
              <p className="text-xs text-danger mt-1">{(tablesError as Error).message}</p>
            )}
          </Field>

          {selectedEntity && (
            <ColumnsBar
              columns={columns}
              fields={fields ?? []}
              views={views ?? []}
              viewsLoading={viewsLoading}
              viewsError={viewsError ? (viewsError as Error).message : null}
              selectedViewId={selectedViewId}
              onSelectView={handleSelectView}
              onRemoveColumn={handleRemoveColumn}
              onEditColumns={() => setColumnPickerOpen(true)}
            />
          )}

          {/* Filters */}
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-fg-muted tracking-wider">Filters</span>
              {fieldsLoading && <span className="text-xs text-fg-muted">Loading fields…</span>}
              {validationErrors.length > 0 && (
                <span className="text-xs text-danger">
                  {validationErrors.length} error{validationErrors.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              {selectedEntity ? (
                <FilterTree
                  root={tree.root}
                  fields={fields ?? []}
                  rootEntity={selectedEntity}
                  connectionId={connectionId || null}
                  tables={tables ?? []}
                  relationships={relationships ?? []}
                  errors={validationErrors}
                  actions={tree}
                />
              ) : (
                <p className="text-xs text-fg-muted italic">Select a table to build filters.</p>
              )}
            </div>
          </div>
        </Panel>

        <Separator className="w-1 mx-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent transition-colors" />

        {/* Right: results / fetchxml toggle */}
        <Panel defaultSize="50%" minSize="30%" className="flex flex-col min-h-0 min-w-0 gap-2 overflow-hidden">
          <div className="flex items-center gap-1 border-b border-line shrink-0">
            <ViewTab active={rightView === "results"} onClick={() => setRightView("results")}>
              Results
            </ViewTab>
            <ViewTab active={rightView === "fetchxml"} onClick={() => setRightView("fetchxml")}>
              FetchXML
            </ViewTab>
          </div>

          <div className="flex flex-col flex-1 min-h-0">
            {rightView === "results" ? (
              <ResultsGrid
                result={resultData}
                isLoading={isPending}
                error={null}
                page={page}
                onPageChange={handlePageChange}
                fieldMeta={fields ?? []}
                entityLogicalName={selectedEntity?.logicalName ?? null}
                envUrl={selectedConnection?.envUrl ?? null}
                requestedColumns={runColumns}
                onAddColumn={() => setColumnPickerOpen(true)}
                onRemoveColumn={handleRemoveColumn}
              />
            ) : (
              <FetchXmlView fetchXml={lastFetchXml} />
            )}
          </div>
        </Panel>
      </Group>
      </div>
      <ColumnPickerModal
        open={columnPickerOpen}
        fields={fields ?? []}
        columns={columns}
        onClose={() => setColumnPickerOpen(false)}
        onApply={(next) => {
          setColumnPickerOpen(false);
          applyColumns(next);
        }}
      />
    </FetchXmlBuilderProvider>
  );
}

interface ViewTabProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ViewTab({ active, onClick, children }: ViewTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text tracking-wider px-3 py-1.5 border-b-2 transition-colors -mb-px ${
        active
          ? "border-accent-text text-fg"
          : "border-transparent text-fg-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
