import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { Group, Panel, Separator } from "react-resizable-panels";
import { desktopBridge } from "../../platform/desktopBridge";
import { useConnections, useConnectionSelection } from "../../shared/connections";
import { useToolStatus } from "../../shared/status";
import { Button, Checkbox, DataTable, SearchInput, Spinner, ToastProvider, useToast, type ToastType } from "../../shared/ui";
import { fetchComponentTypes, fetchCopyJob, fetchSolutions, startCopy } from "./api/solutionComponentsApi";
import { solutionComponentKeys } from "./api/queryKeys";
import { ComponentTypeModal } from "./components/ComponentTypeModal";
import { CopyLog, type LogRow } from "./components/CopyLog";
import { LabeledCheckbox } from "./components/LabeledCheckbox";
import { SortButtons } from "./components/SortButtons";
import { toSolutionComponentsError } from "./model/apiError";
import type { CopyEntry, SolutionRow, SortState } from "./model/types";
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
  "Select an environment from the connection control at the bottom of the tool sidebar.";

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
  const { activeConnectionName, isActiveConnectionLoaded, connections } = useConnections();
  const { connectionName, setConnectionName } = useConnectionSelection();
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
    if (!isActiveConnectionLoaded) return;
    setConnectionName(activeConnectionName ?? "");
  }, [activeConnectionName, isActiveConnectionLoaded, setConnectionName]);

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
  const solutionsLoading = !!connectionName && solutionsQuery.isFetching;
  const canCopy = !!connectionName
    && !solutionsLoading
    && !solutionsQuery.isError
    && sources.size > 0
    && targets.size > 0
    && !copyRunning;
  const canOpen = !!connectionName && !solutionsLoading && !solutionsQuery.isError && !!focusedId;

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

  const openSolution = async () => {
    const solution = solutions.find((row) => row.id === focusedId);
    if (!solution) return;
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
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[var(--color-bg-dark)] text-[var(--color-text-white)]">
      <div className="flex shrink-0 flex-wrap items-center gap-3 bg-[var(--color-bg-darker)] px-3 py-2">
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-[var(--color-text-white)]">
            <Checkbox checked={checkBestPractice} onChange={setCheckBestPractice} />
            <span>Block a copy that would add a fully included managed table from an unmanaged source.</span>
          </label>
          <p className="text-[var(--color-text-dark-gray)]">Copy leaves every source solution unchanged.</p>
        </div>
        <Button type="button" onClick={() => setModalOpen(true)} disabled={!canCopy}>
          Copy components
        </Button>
        <Button type="button" variant="secondary" onClick={() => void openSolution()} disabled={!canOpen}>
          Open in browser
        </Button>
      </div>
      <Group orientation="vertical" className="min-h-0 flex-1">
        <Panel minSize="30%" className="flex min-h-0 min-w-0 flex-col bg-[var(--color-bg-darker)]">
          <div className="flex shrink-0 flex-col gap-2 p-3">
            <fieldset disabled={!connectionName} className="m-0 border-0 p-0">
              <SearchInput value={filter} onChange={setFilter} placeholder="Filter solutions" />
            </fieldset>
            <SortButtons
              sort={sort}
              disabled={!connectionName}
              onSort={(column) => setSort((current) => toggleSort(current, column))}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {!connectionName ? (
              <p className="text-[var(--color-text-dark-gray)]">{noEnvironmentMessage}</p>
            ) : solutionsLoading ? (
              <div role="status" aria-label="Loading solutions">
                <Spinner />
              </div>
            ) : solutionsQuery.isError ? (
              <div className="flex flex-col items-start gap-3">
                <p role="alert" className="text-[var(--color-text-gray)]">
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
                  { key: "friendlyName", header: "Friendly name", render: (row: SolutionRow) => row.friendlyName },
                  { key: "uniqueName", header: "Unique name", render: (row: SolutionRow) => row.uniqueName },
                  { key: "publisher", header: "Publisher", render: (row: SolutionRow) => row.publisherName ?? "" },
                  { key: "installed", header: "Installed", render: (row: SolutionRow) => row.installedOn ?? "" },
                  { key: "version", header: "Version", render: (row: SolutionRow) => row.version },
                  { key: "managed", header: "Managed", render: (row: SolutionRow) => managedLabel(row.isManaged) },
                ]}
                rows={visible}
                getRowKey={(row) => row.id}
                selectedKey={focusedId}
                onRowClick={(row) => setFocusedId(row.id)}
                emptyMessage={solutions.length === 0 ? "No solutions" : "No matching solutions"}
              />
            )}
          </div>
        </Panel>
        <Separator
          aria-label="Resize panes"
          className="h-1 cursor-row-resize bg-[var(--color-bg-light)] hover:bg-[var(--color-primary)] active:bg-[var(--color-primary)]"
        />
        <Panel minSize="20%" className="flex min-h-0 min-w-0 flex-col bg-[var(--color-bg-darker)]">
          {!connectionName ? (
            <p className="p-3 text-[var(--color-text-dark-gray)]">{noEnvironmentMessage}</p>
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
