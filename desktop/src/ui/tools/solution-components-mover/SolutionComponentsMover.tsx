import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { Group, Panel, Separator } from "react-resizable-panels";
import { desktopBridge } from "../../platform/desktopBridge";
import { useConnections, useTabConnection } from "../../shared/connections";
import { useToolStatus } from "../../shared/status";
import { Button, Checkbox, DataTable, SearchInput, Spinner, ToastProvider, useToast, type ToastType } from "../../shared/ui";
import { fetchComponentTypes, fetchCopyJob, fetchSolutions, startCopy } from "./api/solutionComponentsApi";
import { solutionComponentKeys } from "./api/queryKeys";
import { ComponentTypeModal } from "./components/ComponentTypeModal";
import { CopyLog, type LogRow } from "./components/CopyLog";
import { LabeledCheckbox } from "./components/LabeledCheckbox";
import { toSolutionComponentsError } from "./model/apiError";
import type { CopyEntry, SolutionRow, SortColumn, SortState } from "./model/types";
import {
  defaultSort,
  filterSolutions,
  managedLabel,
  solutionEditorUrl,
  solutionLabel,
  sortSolutions,
  toggleSort,
} from "./model/view";

const noEnvironmentMessage =
  "Right-click this tab and choose Change connection.";

type Phase = "idle" | "running" | "refused" | "finished";

export default function SolutionComponentsMover() {
  return (
    <ToastProvider>
      <SolutionComponentsMoverPage />
    </ToastProvider>
  );
}

function SolutionComponentsMoverPage() {
  const { showToast } = useToast();
  const { connections } = useConnections();
  const { connectionName: tabConnectionName } = useTabConnection();
  const connectionName = tabConnectionName ?? "";
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortState>(defaultSort);
  const [sources, setSources] = useState<Set<string>>(() => new Set());
  const [targets, setTargets] = useState<Set<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [checkBestPractice, setCheckBestPractice] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<LogRow[]>([]);
  const [logEnvironmentName, setLogEnvironmentName] = useState<string | null>(null);
  const [processed, setProcessed] = useState(0);
  const [total, setTotal] = useState(0);
  const [succeeded, setSucceeded] = useState(0);
  const [failed, setFailed] = useState(0);
  const [activeJob, setActiveJob] = useState<{ jobId: string; connectionName: string } | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const toastedJob = useRef<string | null>(null);

  useEffect(() => {
    setFilter("");
    setSort(defaultSort);
    setSources(new Set());
    setTargets(new Set());
    setFocusedId(null);
    if (phaseRef.current !== "running") setPhase("idle");
  }, [connectionName]);

  const solutionsQuery = useQuery({
    queryKey: solutionComponentKeys.solutions(connectionName),
    queryFn: () => fetchSolutions(connectionName),
    enabled: !!connectionName,
  });
  const typesQuery = useQuery({
    queryKey: solutionComponentKeys.types(connectionName),
    queryFn: () => fetchComponentTypes(connectionName),
    enabled: modalOpen && !!connectionName,
  });

  useEffect(() => {
    if (!solutionsQuery.isError) return;
    showToast(toSolutionComponentsError(solutionsQuery.error), "error");
  }, [showToast, solutionsQuery.error, solutionsQuery.isError]);

  useEffect(() => {
    if (!modalOpen || !typesQuery.isError) return;
    showToast(toSolutionComponentsError(typesQuery.error), "error");
  }, [modalOpen, showToast, typesQuery.error, typesQuery.isError]);

  useEffect(() => {
    if (!activeJob) return;
    let cancelled = false;
    const run = async () => {
      while (!cancelled) {
        try {
          const next = await fetchCopyJob(activeJob.connectionName, activeJob.jobId);
          if (cancelled) return;
          setProcessed(next.processed);
          setTotal(next.total);
          setSucceeded(next.succeeded);
          setFailed(next.failed);
          setLog(toLogRows(next.entries));
          if (next.status === "queued" || next.status === "running") {
            await new Promise((resolve) => setTimeout(resolve, 200));
            continue;
          }
          setPhase(next.status === "refused" ? "refused" : "finished");
          if (toastedJob.current !== activeJob.jobId) {
            toastedJob.current = activeJob.jobId;
            showResultToast(next, showToast);
          }
          return;
        } catch (error) {
          if (cancelled) return;
          setPhase("idle");
          showToast(toSolutionComponentsError(error), "error");
          return;
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeJob, showToast]);

  const solutions = useMemo(
    () => (solutionsQuery.isError ? [] : solutionsQuery.data?.solutions ?? []),
    [solutionsQuery.data, solutionsQuery.isError],
  );
  const visible = useMemo(
    () => sortSolutions(filterSolutions(solutions, filter), sort.column, sort.direction),
    [filter, solutions, sort.column, sort.direction],
  );
  const environment = connections.find((item) => item.name === connectionName);
  const copyRunning = phase === "running";
  const solutionsLoading = !!connectionName && solutionsQuery.isLoading;
  const canCopy = !!connectionName
    && !solutionsLoading
    && !solutionsQuery.isError
    && sources.size > 0
    && targets.size > 0
    && !copyRunning;
  const canRefresh = !!connectionName && !solutionsQuery.isFetching;

  const status = useMemo(() => {
    if (!connectionName) return "No environment selected";
    if (copyRunning) return "Copying components…";
    if (phase === "refused") return "Copy refused";
    if (phase === "finished") return `Copy finished: ${succeeded} succeeded, ${failed} failed`;
    if (modalOpen && typesQuery.isFetching) return "Loading component types…";
    if (modalOpen && typesQuery.isError) return "Could not load component types";
    if (solutionsQuery.isFetching) return "Loading solutions…";
    if (solutionsQuery.isError) return "Could not load solutions";
    if (solutionsQuery.data) return `${solutionsQuery.data.solutions.length} solutions`;
    return "No environment selected";
  }, [
    connectionName,
    copyRunning,
    failed,
    modalOpen,
    phase,
    solutionsQuery.data,
    solutionsQuery.isError,
    solutionsQuery.isFetching,
    succeeded,
    typesQuery.isError,
    typesQuery.isFetching,
  ]);
  useToolStatus(status);

  const toggleSet = (
    setter: Dispatch<SetStateAction<Set<string>>>,
    id: string,
    checked: boolean,
  ) => {
    setter((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const openSolution = async (solution: SolutionRow) => {
    setFocusedId(solution.id);
    if (!environment?.envUrl) {
      showToast("The environment address is not available.", "error");
      return;
    }
    try {
      await desktopBridge.openExternalUrl(solutionEditorUrl(environment.envUrl, solution.id));
    } catch (error) {
      showToast(toSolutionComponentsError(error), "error");
    }
  };

  const confirmCopy = async (componentTypes: number[], allComponents: boolean) => {
    setModalOpen(false);
    setLog([]);
    setLogEnvironmentName(connectionName);
    setProcessed(0);
    setTotal(0);
    setSucceeded(0);
    setFailed(0);
    setPhase("running");
    try {
      const started = await startCopy(connectionName, {
        sourceSolutionIds: [...sources],
        targetSolutionIds: [...targets],
        componentTypes,
        allComponents,
        checkBestPractice,
      });
      setActiveJob({ jobId: started.jobId, connectionName });
    } catch (error) {
      setPhase("idle");
      const message = toSolutionComponentsError(error);
      setLog([{
        key: "copy-error",
        componentId: "",
        componentType: 0,
        label: "Copy",
        solutionUniqueName: "",
        succeeded: false,
        message,
      }]);
      showToast(message, "error");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-canvas text-fg-strong">
      <div className="flex shrink-0 items-center justify-between gap-3 bg-surface px-3 py-2">
        <label className="flex items-center gap-2 text-fg-strong">
          <Checkbox checked={checkBestPractice} onChange={setCheckBestPractice} />
          <span>Block a copy that would add a fully included managed table from an unmanaged source.</span>
        </label>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Refresh solutions"
            disabled={!canRefresh}
            onClick={() => void solutionsQuery.refetch()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-fg hover:bg-hover hover:text-fg-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshIcon />
          </button>
          <Button type="button" onClick={() => setModalOpen(true)} disabled={!canCopy}>
            Copy components
          </Button>
        </div>
      </div>
      <Group orientation="vertical" className="min-h-0 flex-1">
        <Panel minSize="30%" className="flex min-h-0 min-w-0 flex-col bg-surface">
          <div className="flex shrink-0 flex-col gap-2 p-3">
            <fieldset disabled={!connectionName} className="m-0 border-0 p-0">
              <SearchInput value={filter} onChange={setFilter} placeholder="Filter solutions" />
            </fieldset>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {!connectionName ? (
              <p className="text-fg-muted">{noEnvironmentMessage}</p>
            ) : solutionsLoading ? (
              <div role="status" aria-label="Loading solutions">
                <Spinner />
              </div>
            ) : solutionsQuery.isError ? (
              <div className="flex flex-col items-start gap-3">
                <p role="alert" className="text-fg">
                  {toSolutionComponentsError(solutionsQuery.error)}
                </p>
                <Button type="button" variant="secondary" onClick={() => void solutionsQuery.refetch()}>
                  Retry
                </Button>
              </div>
            ) : (
              <DataTable
                columns={[
                  {
                    key: "source",
                    header: "Source",
                    render: (row: SolutionRow) => (
                      <LabeledCheckbox
                        label={`Source ${solutionLabel(row)}`}
                        checked={sources.has(row.id)}
                        onChange={(checked) => toggleSet(setSources, row.id, checked)}
                      />
                    ),
                  },
                  {
                    key: "target",
                    header: "Target",
                    render: (row: SolutionRow) => (
                      <LabeledCheckbox
                        label={row.isManaged
                          ? `A managed solution cannot be a target ${solutionLabel(row)}`
                          : `Target ${solutionLabel(row)}`}
                        checked={!row.isManaged && targets.has(row.id)}
                        disabled={row.isManaged}
                        onChange={(checked) => {
                          if (row.isManaged) return;
                          toggleSet(setTargets, row.id, checked);
                        }}
                      />
                    ),
                  },
                  {
                    key: "friendlyName",
                    header: "Display Name",
                    sortable: true,
                    render: (row: SolutionRow) => row.friendlyName,
                  },
                  {
                    key: "uniqueName",
                    header: "Name",
                    sortable: true,
                    render: (row: SolutionRow) => row.uniqueName,
                  },
                  {
                    key: "publisherName",
                    header: "Publisher",
                    sortable: true,
                    render: (row: SolutionRow) => row.publisherName ?? "",
                  },
                  {
                    key: "installedOn",
                    header: "Installed",
                    sortable: true,
                    render: (row: SolutionRow) => row.installedOn ?? "",
                  },
                  {
                    key: "version",
                    header: "Version",
                    sortable: true,
                    render: (row: SolutionRow) => row.version,
                  },
                  {
                    key: "isManaged",
                    header: "Managed",
                    sortable: true,
                    render: (row: SolutionRow) => managedLabel(row.isManaged),
                  },
                ]}
                rows={visible}
                getRowKey={(row) => row.id}
                selectedKey={focusedId}
                sortKey={sort.column}
                sortDirection={sort.direction}
                onSort={(column) => setSort((current) => toggleSort(current, column as SortColumn))}
                onRowClick={(row) => setFocusedId(row.id)}
                onRowDoubleClick={(row) => void openSolution(row)}
                emptyMessage={solutions.length === 0 ? "No solutions" : "No matching solutions"}
              />
            )}
          </div>
        </Panel>
        <Separator
          aria-label="Resize panes"
          className="h-1 cursor-row-resize bg-raised hover:bg-accent active:bg-accent"
        />
        <Panel minSize="20%" className="flex min-h-0 min-w-0 flex-col bg-surface">
          {!connectionName ? (
            <p className="p-3 text-fg-muted">{noEnvironmentMessage}</p>
          ) : (
            <CopyLog
              environmentName={logEnvironmentName}
              rows={log}
              running={copyRunning}
              showProgress={copyRunning || phase === "refused"}
              processed={processed}
              total={total}
              onClear={() => {
                setLog([]);
                setLogEnvironmentName(null);
              }}
            />
          )}
        </Panel>
      </Group>
      <ComponentTypeModal
        open={modalOpen}
        types={typesQuery.data ? typesQuery.data.componentTypes : null}
        loading={typesQuery.isFetching && !typesQuery.isError}
        errorText={typesQuery.isError ? toSolutionComponentsError(typesQuery.error) : null}
        onCancel={() => setModalOpen(false)}
        onRetry={() => void typesQuery.refetch()}
        onCopy={(componentTypes, allComponents) => void confirmCopy(componentTypes, allComponents)}
      />
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v5h-5" />
    </svg>
  );
}

function toLogRows(entries: CopyEntry[]): LogRow[] {
  return entries.map((entry, index) => ({
    ...entry,
    key: `${index}:${entry.componentId}:${entry.solutionUniqueName}`,
  }));
}

function showResultToast(
  job: { status: string; succeeded: number; failed: number; entries: CopyEntry[] },
  showToast: (message: string, type?: ToastType) => void,
) {
  if (job.status === "refused") {
    showToast(job.entries.find((entry) => !entry.succeeded)?.message || "The copy was refused.", "error");
    return;
  }
  if (job.succeeded === 0 && job.failed === 0) {
    showToast("No components to copy", "info");
    return;
  }
  if (job.failed === 0) showToast("Copy finished", "success");
  else if (job.succeeded === 0) showToast("Copy finished with no successes", "error");
  else showToast("Copy finished with failures", "info");
}
