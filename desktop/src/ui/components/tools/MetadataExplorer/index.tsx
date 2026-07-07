import { useEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { ToastProvider, useToast } from "../../ui/Toast";
import type { ConnectionInfo } from "../../../vite-env";
import type { EntityInfo } from "./model/types";
import { TableSelector } from "./TableSelector";
import { FilterTree } from "./FilterBuilder/FilterTree";
import { ResultsGrid } from "./ResultsGrid";
import { FetchXmlModal } from "./FetchXmlModal";
import { Button } from "../../ui/Button";
import { useFilterTree } from "./hooks/useFilterTree";
import { useTableMetadata } from "./hooks/useTableMetadata";
import { useRunFetch } from "./hooks/useRunFetch";
import { buildFetchXml } from "./model/fetchxml";
import { validateTree } from "./model/validation";
import type { FetchResult } from "./model/types";

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
  const [fetchXmlOpen, setFetchXmlOpen] = useState(false);
  const [lastFetchXml, setLastFetchXml] = useState("");
  const [validationErrors, setValidationErrors] = useState<ReturnType<typeof validateTree>>([]);

  const { showToast } = useToast();
  const tree = useFilterTree();
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

  const handleSelectEntity = (entity: EntityInfo) => {
    setSelectedEntity(entity);
    tree.reset();
    resetResult();
    setPage(1);
    setPagingCookies({});
    setValidationErrors([]);
    setLastFetchXml("");
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
              setSelectedEntity(null);
              resetResult();
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

        {selectedEntity && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[#858585]">Table:</span>
            <span className="font-medium text-[#cccccc]">{selectedEntity.displayName}</span>
            <span className="text-xs text-[#858585] font-mono">({selectedEntity.logicalName})</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={handleClearAll} className="text-sm py-1.5">
            Clear all
          </Button>
          <Button variant="primary" onClick={() => handleRun(1)} disabled={!canRun} className="text-sm py-1.5">
            {isPending ? "Running…" : "Run"}
          </Button>
        </div>
      </div>

      {/* Main layout */}
      <Group className="flex flex-1 min-h-0">
        {/* Left: table list */}
        <Panel defaultSize="22%" minSize="15%" className="flex flex-col min-h-0">
          <TableSelector
            connectionName={connectionName || null}
            selected={selectedEntity}
            onSelect={handleSelectEntity}
          />
        </Panel>

        <Separator className="w-1 mx-1 cursor-col-resize bg-(--color-bg-light) hover:bg-(--color-primary) active:bg-(--color-primary) transition-colors" />

        {/* Right: filter + results */}
        <Panel minSize="50%" className="flex flex-col min-h-0 gap-4 overflow-hidden">
          {/* Filter builder */}
          <div className="flex flex-col gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#858585] uppercase tracking-wider">Filters</span>
              {fieldsLoading && <span className="text-xs text-[#858585]">Loading fields…</span>}
              {validationErrors.length > 0 && (
                <span className="text-xs text-[#f48771]">
                  {validationErrors.length} error{validationErrors.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {selectedEntity ? (
              <FilterTree root={tree.root} fields={fields ?? []} errors={validationErrors} actions={tree} />
            ) : (
              <p className="text-xs text-[#858585] italic">Select a table to build filters.</p>
            )}
          </div>

          <Separator className="h-px bg-[#3c3c3c]" />

          {/* Results */}
          <div className="flex flex-col flex-1 min-h-0">
            <ResultsGrid
              result={resultData}
              isLoading={isPending}
              error={null}
              page={page}
              onPageChange={handlePageChange}
              onViewFetchXml={() => setFetchXmlOpen(true)}
            />
          </div>
        </Panel>
      </Group>

      <FetchXmlModal open={fetchXmlOpen} fetchXml={lastFetchXml} onClose={() => setFetchXmlOpen(false)} />
    </div>
  );
}
