import { useEffect, useMemo, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { ToastProvider, useToast } from "../../ui/Toast";
import type { ConnectionInfo } from "../../../vite-env";
import type { EntityInfo, FetchResult } from "./model/types";
import { FilterTree } from "./FilterBuilder/FilterTree";
import { ResultsGrid } from "./ResultsGrid";
import { FetchXmlView } from "./FetchXmlView";
import { Button } from "../../ui/Button";
import { Spinner } from "../../ui/Spinner";
import { useFilterTree } from "./hooks/useFilterTree";
import { useTables } from "./hooks/useTables";
import { useTableMetadata } from "./hooks/useTableMetadata";
import { useRunFetch } from "./hooks/useRunFetch";
import { buildFetchXml } from "./model/fetchxml";
import { validateTree } from "./model/validation";

type RightView = "results" | "fetchxml";

export default function MetadataExplorer() {
  return (
    <ToastProvider>
      <MetadataExplorerPage />
    </ToastProvider>
  );
}

function MetadataExplorerPage() {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [connectionName, setConnectionName] = useState<string>("");
  const [selectedEntity, setSelectedEntity] = useState<EntityInfo | null>(null);
  const [page, setPage] = useState(1);
  const [pagingCookies, setPagingCookies] = useState<Record<number, string>>({});
  const [lastFetchXml, setLastFetchXml] = useState("");
  const [validationErrors, setValidationErrors] = useState<ReturnType<typeof validateTree>>([]);
  const [rightView, setRightView] = useState<RightView>("results");

  const { showToast } = useToast();
  const tree = useFilterTree();
  const { data: tables, isLoading: tablesLoading, error: tablesError } = useTables(connectionName || null);
  const { data: fields, isLoading: fieldsLoading } = useTableMetadata(
    selectedEntity?.logicalName ?? null,
    connectionName || null,
  );
  const { mutate: runFetch, data: result, isPending, reset: resetResult } = useRunFetch(connectionName || null);

  // Load connections from Electron
  useEffect(() => {
    window.electron.listConnections().then((list) => {
      setConnections(list);
    });

    window.electron.getActiveConnection().then((activeConnection) => {
      if (activeConnection && "name" in activeConnection) {
        setConnectionName(activeConnection.name);
      }
    });

    const unsubscribe = window.electron.onConnectionsUpdated((list) => {
      setConnections(list);
    });
    return unsubscribe;
  }, []);

  const sortedTables = useMemo(
    () => [...(tables ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [tables],
  );

  const handleSelectEntity = (entity: EntityInfo | null) => {
    setSelectedEntity(entity);
    tree.reset();
    resetResult();
    setPage(1);
    setPagingCookies({});
    setValidationErrors([]);
    setLastFetchXml("");
  };

  const handleEntityChange = (logicalName: string) => {
    const entity = sortedTables.find((e) => e.logicalName === logicalName) ?? null;
    handleSelectEntity(entity);
  };

  const handleRun = (targetPage = 1) => {
    const errors = validateTree(tree.root);
    setValidationErrors(errors);
    if (errors.length > 0) {
      showToast("Fix validation errors before running.", "error");
      return;
    }
    if (!selectedEntity) return;

    const fetchXml = buildFetchXml(selectedEntity.logicalName, tree.root);
    setLastFetchXml(fetchXml);
    setPage(targetPage);

    runFetch(
      {
        fetchXml,
        page: targetPage,
        pageSize: 50,
        pagingCookie: pagingCookies[targetPage - 1],
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

  const handleClearAll = () => {
    tree.reset();
    resetResult();
    setPage(1);
    setPagingCookies({});
    setValidationErrors([]);
    setLastFetchXml("");
  };

  const canRun = !!selectedEntity && !!connectionName && !isPending;
  const resultData: FetchResult | null = result ?? null;

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 gap-4 text-[#cccccc] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#858585] tracking-wider">Connection</label>
          <select
            value={connectionName}
            onChange={(e) => {
              setConnectionName(e.target.value);
              handleSelectEntity(null);
            }}
            className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] text-sm px-2 py-1.5 rounded-sm focus:outline-none focus:border-[#007fd4] w-52"
          >
            <option value="">— select —</option>
            {connections.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

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
          <div className="flex flex-col gap-1 shrink-0 min-w-0">
            <label className="text-xs text-[#858585] tracking-wider uppercase">Table</label>
            <div className="flex items-center gap-2 min-w-0">
              <select
                value={selectedEntity?.logicalName ?? ""}
                onChange={(e) => handleEntityChange(e.target.value)}
                disabled={!connectionName || tablesLoading}
                className="w-72 shrink-0 truncate bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] text-sm px-2 py-1.5 rounded-sm focus:outline-none focus:border-[#007fd4] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">
                  {!connectionName
                    ? "— select a connection first —"
                    : tablesLoading
                      ? "Loading tables…"
                      : "— select a table —"}
                </option>
                {sortedTables.map((e) => (
                  <option key={e.logicalName} value={e.logicalName}>
                    {e.displayName} ({e.logicalName}){e.isCustom ? " • custom" : ""}
                  </option>
                ))}
              </select>
              {tablesLoading && <Spinner size={14} />}
              <Button variant="ghost" onClick={handleClearAll} className="text-xs py-1 px-2 shrink-0 ml-auto">
                Clear all
              </Button>
            </div>
            {tablesError && (
              <p className="text-xs text-[#f48771] mt-1">{(tablesError as Error).message}</p>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-[#858585] uppercase tracking-wider">Filters</span>
              {fieldsLoading && <span className="text-xs text-[#858585]">Loading fields…</span>}
              {validationErrors.length > 0 && (
                <span className="text-xs text-[#f48771]">
                  {validationErrors.length} error{validationErrors.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              {selectedEntity ? (
                <FilterTree root={tree.root} fields={fields ?? []} errors={validationErrors} actions={tree} />
              ) : (
                <p className="text-xs text-[#858585] italic">Select a table to build filters.</p>
              )}
            </div>
          </div>
        </Panel>

        <Separator className="w-1 mx-1 cursor-col-resize bg-(--color-bg-light) hover:bg-(--color-primary) active:bg-(--color-primary) transition-colors" />

        {/* Right: results / fetchxml toggle */}
        <Panel defaultSize="50%" minSize="30%" className="flex flex-col min-h-0 min-w-0 gap-2 overflow-hidden">
          <div className="flex items-center gap-1 border-b border-[#3c3c3c] shrink-0">
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
              />
            ) : (
              <FetchXmlView fetchXml={lastFetchXml} />
            )}
          </div>
        </Panel>
      </Group>
    </div>
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
      className={`text-xs uppercase tracking-wider px-3 py-1.5 border-b-2 transition-colors -mb-px ${
        active
          ? "border-[#007fd4] text-[#cccccc]"
          : "border-transparent text-[#858585] hover:text-[#cccccc]"
      }`}
    >
      {children}
    </button>
  );
}
