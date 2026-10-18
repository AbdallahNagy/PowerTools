import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useTabConnection } from "../../shared/connections";
import { useToolStatus } from "../../shared/status";
import { Alert, Button, EmptyState, Spinner, Tabs, ToastProvider, useToast } from "../../shared/ui";
import {
  removeActiveLayer,
  useComponentSearch,
  useComponentTypes,
  useLayers,
  useTables,
} from "./api/solutionLayersApi";
import { solutionLayersKeys } from "./api/queryKeys";
import { BulkRemoveDialog, type BulkPhase } from "./components/BulkRemoveDialog";
import { ComponentPicker, type TableMode } from "./components/ComponentPicker";
import { LayerCompare } from "./components/LayerCompare";
import { LayerDetails, type ContentTab } from "./components/LayerDetails";
import { LayerListHeader, LayerTable } from "./components/LayerList";
import { RemoveActiveDialog } from "./components/RemoveActiveDialog";
import {
  isNotRemovable,
  readErrorText,
  removeErrorText,
  toSolutionLayersError,
} from "./model/apiError";
import {
  COLUMN_TYPE,
  FORM_TYPE,
  TABLE_TYPE,
  VIEW_TYPE,
  type ComponentRow,
  type RemovalEntry,
} from "./model/types";
import {
  bulkToast,
  defaultComparePair,
  layersStatus,
  nextSort,
  removeDisabledReason,
  sortComponents,
  type ComponentSortKey,
  type SortState,
} from "./model/view";

const SEARCH_DELAY_MS = 300;

function NoEnvironment() {
  return (
    <EmptyState
      title="Select an environment"
      description="Choose an environment in the connection control at the bottom of the sidebar."
    />
  );
}

function tableModeFor(componentType: number | null): TableMode {
  if (componentType === COLUMN_TYPE) return "required";
  if (componentType === FORM_TYPE || componentType === VIEW_TYPE) return "optional";
  return "none";
}

interface BulkRun {
  connectionId: string;
  components: ComponentRow[];
  phase: BulkPhase;
  entries: RemovalEntry[];
  stopping: boolean;
}

interface BulkFinished {
  version: number;
  connectionId: string;
  componentIds: ReadonlySet<string>;
}

export default function SolutionLayersExplorer() {
  return (
    <ToastProvider>
      <SolutionLayersTool />
    </ToastProvider>
  );
}

/**
 * Holds what must outlive an environment change: a bulk removal keeps running against the
 * environment it started on. Everything else lives in ExplorerPage, which is reset when the
 * tab's environment changes.
 */
function SolutionLayersTool() {
  const { connectionId } = useTabConnection();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [bulk, setBulk] = useState<BulkRun | null>(null);
  const [finished, setFinished] = useState<BulkFinished>({
    version: 0,
    connectionId: "",
    componentIds: new Set(),
  });
  const stopRequested = useRef(false);

  const startBulk = (components: ComponentRow[]) => {
    if (!connectionId || components.length === 0) return;
    setBulk({ connectionId, components, phase: "confirm", entries: [], stopping: false });
  };

  const runBulk = async () => {
    if (!bulk) return;
    const run = bulk;
    stopRequested.current = false;
    setBulk({ ...run, phase: "running" });
    const entries: RemovalEntry[] = [];
    for (const component of run.components) {
      if (stopRequested.current) break;
      const name = component.name || component.logicalName;
      try {
        const refreshed = await removeActiveLayer(run.connectionId, component.componentType, component.componentId);
        queryClient.setQueryData(
          solutionLayersKeys.layers(run.connectionId, component.componentType, component.componentId),
          refreshed,
        );
        entries.push({ componentId: component.componentId, name, result: "Removed", detail: "" });
      } catch (error) {
        const parsed = toSolutionLayersError(error);
        entries.push({
          componentId: component.componentId,
          name,
          result: isNotRemovable(parsed) ? "Skipped" : "Failed",
          detail: parsed.message,
        });
      }
      const snapshot = [...entries];
      setBulk((current) => (current ? { ...current, entries: snapshot } : current));
    }
    setBulk((current) => (current ? { ...current, phase: "done" } : current));
    const toast = bulkToast(entries, run.components.length);
    showToast(toast.message, toast.type);
  };

  const finishBulk = () => {
    if (!bulk) return;
    for (const component of bulk.components) {
      void queryClient.invalidateQueries({
        queryKey: solutionLayersKeys.layers(bulk.connectionId, component.componentType, component.componentId),
      });
    }
    setFinished((current) => ({
      version: current.version + 1,
      connectionId: bulk.connectionId,
      componentIds: new Set(bulk.components.map((component) => component.componentId)),
    }));
    setBulk(null);
  };

  const bulkStatus = bulk?.phase === "running"
    ? `Removing Active layers: ${bulk.entries.length} of ${bulk.components.length}`
    : null;

  return (
    <>
      <ExplorerPage
        key={connectionId ?? ""}
        connectionId={connectionId || null}
        bulkStatus={bulkStatus}
        bulkFinished={finished.connectionId === connectionId ? finished : null}
        onBulkRemove={startBulk}
      />
      {bulk ? (
        <BulkRemoveDialog
          connectionId={bulk.connectionId}
          components={bulk.components}
          phase={bulk.phase}
          entries={bulk.entries}
          stopping={bulk.stopping}
          onCancel={() => setBulk(null)}
          onConfirm={() => void runBulk()}
          onStop={() => {
            stopRequested.current = true;
            setBulk((current) => (current ? { ...current, stopping: true } : current));
          }}
          onDone={finishBulk}
        />
      ) : null}
    </>
  );
}

interface ExplorerPageProps {
  connectionId: string | null;
  bulkStatus: string | null;
  bulkFinished: BulkFinished | null;
  onBulkRemove: (components: ComponentRow[]) => void;
}

function ExplorerPage({ connectionId, bulkStatus, bulkFinished, onBulkRemove }: ExplorerPageProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [typeChoice, setTypeChoice] = useState<number | null>(null);
  const [entity, setEntity] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<SortState<ComponentSortKey>>({ key: "name", direction: "asc" });
  const [checked, setChecked] = useState<ReadonlyMap<string, ComponentRow>>(() => new Map());
  const [selected, setSelected] = useState<ComponentRow | null>(null);
  const [layerId, setLayerId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<"details" | "compare">("details");
  const [contentTab, setContentTab] = useState<ContentTab>("changes");
  const [compareLeft, setCompareLeft] = useState<string | null>(null);
  const [compareRight, setCompareRight] = useState<string | null>(null);
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [property, setProperty] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const resetLayerView = () => {
    setLayerId(null);
    setCompareLeft(null);
    setCompareRight(null);
    setProperty(null);
  };

  // After a bulk run on this environment: clear the checks, and show the selected
  // component's reloaded layers from the top if it was part of the run.
  const lastFinished = useRef(bulkFinished?.version ?? 0);
  useEffect(() => {
    if (!bulkFinished || bulkFinished.version === lastFinished.current) return;
    lastFinished.current = bulkFinished.version;
    setChecked(new Map());
    if (selected && bulkFinished.componentIds.has(selected.componentId)) resetLayerView();
  }, [bulkFinished, selected]);

  const typesQuery = useComponentTypes(connectionId);
  const types = useMemo(() => typesQuery.data?.componentTypes ?? [], [typesQuery.data]);
  const componentType = typeChoice
    ?? types.find((type) => type.componentType === TABLE_TYPE)?.componentType
    ?? types[0]?.componentType
    ?? null;
  const tableMode = tableModeFor(componentType);
  const tablesQuery = useTables(connectionId, tableMode !== "none");
  const searchEnabled = tableMode !== "required" || entity !== "";
  const searchQuery = useComponentSearch(connectionId, componentType, debouncedSearch, entity, searchEnabled);
  const rows = useMemo(() => sortComponents(searchQuery.data?.components ?? [], sort), [searchQuery.data, sort]);

  const layersQuery = useLayers(connectionId, selected?.componentType ?? null, selected?.componentId ?? null);
  const layersData = layersQuery.data;
  const layers = useMemo(() => layersData?.layers ?? [], [layersData]);
  const selectedLayer = layers.find((layer) => layer.id === layerId) ?? layers[0] ?? null;
  const defaults = defaultComparePair(layers);
  const leftId = layers.some((layer) => layer.id === compareLeft) ? compareLeft : defaults.left;
  const rightId = layers.some((layer) => layer.id === compareRight) ? compareRight : defaults.right;
  const disabledReason = removeDisabledReason(layersData);
  const typeLabel = (type: number) => types.find((item) => item.componentType === type)?.label ?? "";

  const pickerError = typesQuery.isError
    ? readErrorText(typesQuery.error)
    : searchQuery.isError
      ? readErrorText(searchQuery.error)
      : null;

  const status = (() => {
    if (!connectionId) return "No environment selected";
    if (bulkStatus) return bulkStatus;
    if (removeBusy) return "Removing Active layer…";
    if (pickerError) return "Could not search components";
    if (typesQuery.isFetching || searchQuery.isFetching) return "Searching components…";
    if (selected) {
      if (layersQuery.isError) return "Could not load layers";
      if (layersQuery.isFetching || !layersData) return "Loading layers…";
      return layersStatus(layersData);
    }
    return null;
  })();
  useToolStatus(status);

  const changeType = (next: number) => {
    setTypeChoice(next);
    setEntity("");
    setSearch("");
    setDebouncedSearch("");
    setChecked(new Map());
  };

  const changeEntity = (next: string) => {
    setEntity(next);
    setChecked(new Map());
  };

  const selectComponent = (row: ComponentRow) => {
    if (selected?.componentId !== row.componentId) resetLayerView();
    setSelected(row);
  };

  const check = (row: ComponentRow, value: boolean) => {
    setChecked((current) => {
      const next = new Map(current);
      if (value) next.set(row.componentId, row);
      else next.delete(row.componentId);
      return next;
    });
  };

  const checkAll = (value: boolean) => {
    setChecked((current) => {
      const next = new Map(current);
      for (const row of rows) {
        if (value) next.set(row.componentId, row);
        else next.delete(row.componentId);
      }
      return next;
    });
  };

  const retryPicker = () => {
    if (typesQuery.isError) void typesQuery.refetch();
    if (searchQuery.isError) void searchQuery.refetch();
  };

  const openRemove = () => {
    setRemoveError(null);
    setRemoveOpen(true);
  };

  const confirmRemove = async () => {
    if (!connectionId || !selected) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      const refreshed = await removeActiveLayer(connectionId, selected.componentType, selected.componentId);
      queryClient.setQueryData(
        solutionLayersKeys.layers(connectionId, selected.componentType, selected.componentId),
        refreshed,
      );
      resetLayerView();
      setRemoveOpen(false);
      showToast("Active layer removed.", "success");
    } catch (error) {
      const parsed = toSolutionLayersError(error);
      const text = removeErrorText(parsed);
      setRemoveError(text);
      showToast(text, "error");
      if (isNotRemovable(parsed)) void layersQuery.refetch();
    } finally {
      setRemoveBusy(false);
    }
  };

  const fallbackLayer = layers.find((layer) => !layer.isActive) ?? null;

  let rightPanel;
  if (!connectionId) {
    rightPanel = <NoEnvironment />;
  } else if (!selected) {
    rightPanel = <EmptyState title="Select a component to see its solution layers." />;
  } else {
    const header = (
      <LayerListHeader
        component={selected}
        typeLabel={typeLabel(selected.componentType)}
        onReload={() => void layersQuery.refetch()}
        reloading={layersQuery.isFetching}
        removeDisabledReason={layersQuery.isFetching && !layersData ? "No Active layer" : disabledReason}
        onRemove={openRemove}
      />
    );

    let body;
    if (layersQuery.isError) {
      body = (
        <div className="p-3">
          <Alert
            tone="danger"
            action={
              <Button variant="secondary" size="sm" onClick={() => void layersQuery.refetch()}>
                Retry
              </Button>
            }
          >
            {readErrorText(layersQuery.error)}
          </Alert>
        </div>
      );
    } else if (!layersData) {
      body = (
        <div className="flex flex-1 items-center justify-center" role="status" aria-label="Loading layers">
          <Spinner size={24} />
        </div>
      );
    } else if (layers.length === 0) {
      body = <EmptyState title="No solution layers were found for this component." />;
    } else {
      body = (
        <Group orientation="vertical" className="min-h-0 flex-1">
          <Panel id="sle-layer-list" defaultSize="35%" minSize="15%" className="flex min-h-0 flex-col p-3">
            <LayerTable
              layers={layers}
              selectedLayerId={selectedLayer?.id ?? null}
              onSelectLayer={(layer) => setLayerId(layer.id)}
            />
          </Panel>
          <Separator
            aria-label="Resize layer details"
            className="h-1 cursor-row-resize bg-raised hover:bg-accent active:bg-accent"
          />
          <Panel id="sle-layer-view" minSize="30%" className="flex min-h-0 flex-col">
            <Tabs
              aria-label="Layer view"
              value={viewTab}
              onValueChange={(value) => setViewTab(value as "details" | "compare")}
              className="h-full"
              items={[
                {
                  value: "details",
                  label: "Details",
                  content: selectedLayer ? (
                    <LayerDetails layer={selectedLayer} tab={contentTab} onTabChange={setContentTab} />
                  ) : null,
                },
                {
                  value: "compare",
                  label: "Compare",
                  content: (
                    <LayerCompare
                      componentType={selected.componentType}
                      layers={layers}
                      leftId={leftId ?? layers[0]!.id}
                      rightId={rightId ?? layers[0]!.id}
                      onLeftChange={setCompareLeft}
                      onRightChange={setCompareRight}
                      onlyDifferences={onlyDifferences}
                      onOnlyDifferencesChange={setOnlyDifferences}
                      property={property}
                      onPropertyChange={setProperty}
                    />
                  ),
                },
              ]}
            />
          </Panel>
        </Group>
      );
    }

    rightPanel = (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        {body}
      </div>
    );
  }

  return (
    <>
    <Group orientation="horizontal" className="flex min-h-0 flex-1 bg-canvas">
      <Panel id="sle-components" defaultSize="32%" minSize="22%" className="flex min-h-0 min-w-0 flex-col bg-surface">
        <ComponentPicker
          disabled={!connectionId}
          placeholder={connectionId ? null : <NoEnvironment />}
          types={types}
          componentType={componentType}
          onComponentTypeChange={changeType}
          tableMode={tableMode}
          tables={tablesQuery.data ?? []}
          entity={entity}
          onEntityChange={changeEntity}
          search={search}
          onSearchChange={setSearch}
          loading={typesQuery.isLoading || searchQuery.isLoading}
          error={pickerError}
          onRetry={retryPicker}
          rows={rows}
          truncated={searchQuery.data?.truncated ?? false}
          sort={sort}
          onSort={(key) => setSort((current) => nextSort(current, key))}
          selectedId={selected?.componentId ?? null}
          onSelect={selectComponent}
          checked={checked}
          onCheck={check}
          onCheckAll={checkAll}
          onBulkRemove={() => onBulkRemove([...checked.values()])}
        />
      </Panel>
      <Separator
        aria-label="Resize panes"
        className="w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent"
      />
      <Panel id="sle-layers" minSize="40%" className="flex min-h-0 min-w-0 flex-col bg-surface">
        {rightPanel}
      </Panel>
    </Group>
      {selected && removeOpen ? (
        <RemoveActiveDialog
          open
          component={selected}
          typeLabel={typeLabel(selected.componentType)}
          fallback={fallbackLayer}
          busy={removeBusy}
          error={removeError}
          onCancel={() => setRemoveOpen(false)}
          onConfirm={() => void confirmRemove()}
        />
      ) : null}
    </>
  );
}
