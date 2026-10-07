import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useTabConnection } from "../../shared/connections";
import { useToolStatus } from "../../shared/status";
import { ToastProvider, useToast } from "../../shared/ui";
import {
  cancelRun,
  countRecords,
  fetchEntities,
  fetchRun,
  fetchViews,
  fetchWorkflows,
  startRun,
} from "./api/bulkWorkflowApi";
import { bulkWorkflowKeys } from "./api/queryKeys";
import { QueryPanel } from "./components/QueryPanel";
import { RunView, type RunInfo } from "./components/RunView";
import { StartModal } from "./components/StartModal";
import { ViewList } from "./components/ViewList";
import { WorkflowList } from "./components/WorkflowList";
import { toBulkWorkflowError } from "./model/apiError";
import {
  canStart as countAllowsStart,
  clampBatchSize,
  clampDelay,
  defaultBatchSize,
  endSummary,
  formatCount,
  isActiveStatus,
  isEndStatus,
  runStatusText,
  type CountResult,
} from "./model/run";
import type { ViewRow, WorkflowRow } from "./model/types";
import { defaultViewSort, defaultWorkflowSort, entityLabel } from "./model/view";

const POLL_INTERVAL_MS = 1000;
const separatorClass =
  "bg-raised hover:bg-accent active:bg-accent";

export default function BulkWorkflowExecution() {
  return (
    <ToastProvider>
      <BulkWorkflowExecutionPage />
    </ToastProvider>
  );
}

function BulkWorkflowExecutionPage() {
  const { connectionName: tabConnectionName } = useTabConnection();
  const connectionName = tabConnectionName ?? "";
  const { showToast } = useToast();

  const [workflowFilter, setWorkflowFilter] = useState("");
  const [workflowSort, setWorkflowSort] = useState(defaultWorkflowSort);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState("");
  const [viewSort, setViewSort] = useState(defaultViewSort);
  const [selectedViewKey, setSelectedViewKey] = useState<string | null>(null);
  const [fetchXml, setFetchXml] = useState("");
  const [batchSizeText, setBatchSizeText] = useState(String(defaultBatchSize(null)));
  const [delayText, setDelayText] = useState("0");
  const [count, setCount] = useState<CountResult | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [runInfo, setRunInfo] = useState<RunInfo | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    setWorkflowFilter("");
    setWorkflowSort(defaultWorkflowSort);
    setSelectedWorkflowId(null);
    setViewFilter("");
    setViewSort(defaultViewSort);
    setSelectedViewKey(null);
    setFetchXml("");
    setBatchSizeText(String(defaultBatchSize(null)));
    setDelayText("0");
    setCount(null);
    setCountError(null);
    setStartOpen(false);
  }, [connectionName]);

  const workflowsQuery = useQuery({
    queryKey: bulkWorkflowKeys.workflows(connectionName),
    queryFn: () => fetchWorkflows(connectionName),
    enabled: !!connectionName,
  });
  const entitiesQuery = useQuery({
    queryKey: bulkWorkflowKeys.entities(connectionName),
    queryFn: () => fetchEntities(connectionName),
    enabled: !!connectionName,
    staleTime: Infinity,
  });
  const displayNames = useMemo(
    () => new Map((entitiesQuery.data ?? []).map((entity) => [entity.logicalName, entity.displayName])),
    [entitiesQuery.data],
  );

  const workflows = useMemo(() => workflowsQuery.data?.workflows ?? [], [workflowsQuery.data]);
  const workflow = workflows.find((row) => row.id === selectedWorkflowId) ?? null;
  const entityName = workflow ? entityLabel(workflow.primaryEntity, displayNames) : "";

  const viewsQuery = useQuery({
    queryKey: bulkWorkflowKeys.views(connectionName, workflow?.primaryEntity ?? ""),
    queryFn: () => fetchViews(connectionName, workflow!.primaryEntity),
    enabled: !!connectionName && !!workflow,
  });

  const countMutation = useMutation({
    mutationFn: (body: { connectionName: string; workflowId: string; fetchXml: string }) =>
      countRecords(body.connectionName, { workflowId: body.workflowId, fetchXml: body.fetchXml }),
  });
  const startMutation = useMutation({
    mutationFn: (body: { connectionName: string; batchSize: number; delaySeconds: number; workflowId: string; fetchXml: string }) =>
      startRun(body.connectionName, {
        workflowId: body.workflowId,
        fetchXml: body.fetchXml,
        batchSize: body.batchSize,
        delaySeconds: body.delaySeconds,
      }),
  });

  const runQuery = useQuery({
    queryKey: bulkWorkflowKeys.run(runInfo?.connectionName ?? "", runInfo?.jobId ?? ""),
    queryFn: () => fetchRun(runInfo!.connectionName, runInfo!.jobId),
    enabled: !!runInfo,
    retry: false,
    refetchInterval: (query) => (isEndStatus(query.state.data?.status) ? false : POLL_INTERVAL_MS),
    refetchIntervalInBackground: true,
  });
  const run = runInfo ? runQuery.data : undefined;

  // Announce the end of a run once, so it is seen from another tab too.
  const toastedJob = useRef<string | null>(null);
  useEffect(() => {
    if (!runInfo || !run || !isEndStatus(run.status)) return;
    if (toastedJob.current === runInfo.jobId) return;
    toastedJob.current = runInfo.jobId;
    showToast(`${runInfo.workflow.name}: ${endSummary(run)}`, run.status === "failed" ? "error" : "success");
  }, [run, runInfo, showToast]);

  // A closed tab cannot show its run, so it stops the run instead of leaving it unseen.
  const activeRun = useRef<{ connectionName: string; jobId: string; active: boolean } | null>(null);
  activeRun.current = runInfo
    ? { connectionName: runInfo.connectionName, jobId: runInfo.jobId, active: !run || isActiveStatus(run.status) }
    : null;
  useEffect(
    () => () => {
      const current = activeRun.current;
      if (current?.active) void cancelRun(current.connectionName, current.jobId).catch(() => undefined);
    },
    [],
  );

  const workflowCount = workflows.length;
  const status = useMemo(() => {
    if (runInfo) return runStatusText(run);
    if (!connectionName) return "No environment selected";
    if (countMutation.isPending) return "Counting records…";
    if (workflowsQuery.isLoading) return "Loading workflows…";
    if (workflowsQuery.isError) return "Could not load workflows";
    return `${formatCount(workflowCount)} on-demand workflows`;
  }, [connectionName, countMutation.isPending, run, runInfo, workflowCount, workflowsQuery.isError, workflowsQuery.isLoading]);
  useToolStatus(status);

  const clearCount = () => {
    setCount(null);
    setCountError(null);
  };

  const selectWorkflow = (row: WorkflowRow) => {
    if (row.id === selectedWorkflowId) return;
    setSelectedWorkflowId(row.id);
    setSelectedViewKey(null);
    setViewFilter("");
    setViewSort(defaultViewSort);
    setFetchXml("");
    setBatchSizeText(String(defaultBatchSize(row.mode)));
    clearCount();
  };

  const selectView = (row: ViewRow) => {
    setSelectedViewKey(`${row.kind}:${row.id}`);
    setFetchXml(row.fetchXml);
    clearCount();
  };

  const editFetchXml = (value: string) => {
    setFetchXml(value);
    setSelectedViewKey(null);
    clearCount();
  };

  const runCount = () => {
    if (!workflow || !fetchXml.trim()) return;
    const body = { connectionName, workflowId: workflow.id, fetchXml };
    setCountError(null);
    countMutation.mutate(body, {
      onSuccess: (result) => setCount({ workflowId: body.workflowId, fetchXml: body.fetchXml, count: result.count }),
      onError: (error) => {
        setCount(null);
        setCountError(toBulkWorkflowError(error));
      },
    });
  };

  const batchSize = clampBatchSize(batchSizeText, defaultBatchSize(workflow?.mode));
  const delaySeconds = clampDelay(delayText);
  const startAllowed = countAllowsStart(count, workflow?.id ?? null, fetchXml) && !countMutation.isPending;
  const matchedCount =
    count && workflow && count.workflowId === workflow.id && count.fetchXml === fetchXml ? count.count : null;

  const confirmStart = () => {
    if (!workflow || !count) return;
    const info = { workflow, entityName, batchSize, delaySeconds, connectionName };
    setStartError(null);
    startMutation.mutate(
      { connectionName, workflowId: workflow.id, fetchXml, batchSize, delaySeconds },
      {
        onSuccess: (result) => {
          setStartOpen(false);
          setStopping(false);
          setRunInfo({ ...info, jobId: result.jobId });
        },
        onError: (error) => setStartError(toBulkWorkflowError(error)),
      },
    );
  };

  const stop = () => {
    if (!runInfo) return;
    setStopping(true);
    cancelRun(runInfo.connectionName, runInfo.jobId).catch((error: unknown) => {
      setStopping(false);
      showToast(toBulkWorkflowError(error), "error");
    });
  };

  const newRun = () => {
    setRunInfo(null);
    setStopping(false);
    clearCount();
  };

  if (runInfo) {
    return (
      <RunView
        info={runInfo}
        run={run}
        lostContact={runQuery.isError}
        stopping={stopping}
        onStop={stop}
        onNewRun={newRun}
      />
    );
  }

  if (!connectionName) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-canvas p-6">
        <p className="text-sm text-fg-muted">
          Connect to an environment to list on-demand workflows.
        </p>
      </div>
    );
  }

  return (
    <>
      <Group orientation="horizontal" className="flex min-h-0 flex-1 bg-canvas">
        <Panel defaultSize="30%" minSize="20%" className="flex min-h-0 min-w-0 flex-col bg-canvas">
          <WorkflowList
            workflows={workflows}
            loading={workflowsQuery.isLoading}
            errorText={workflowsQuery.isError ? toBulkWorkflowError(workflowsQuery.error) : null}
            displayNames={displayNames}
            filter={workflowFilter}
            onFilterChange={setWorkflowFilter}
            sort={workflowSort}
            onSortChange={setWorkflowSort}
            selectedId={selectedWorkflowId}
            onSelect={selectWorkflow}
            onRetry={() => void workflowsQuery.refetch()}
          />
        </Panel>
        <Separator aria-label="Resize panes" className={`w-1 cursor-col-resize ${separatorClass}`} />
        <Panel minSize="40%" className="flex min-h-0 min-w-0 flex-col">
          <Group orientation="vertical" className="min-h-0 flex-1">
            <Panel defaultSize="40%" minSize="20%" className="flex min-h-0 min-w-0 flex-col bg-canvas">
              <ViewList
                workflow={workflow}
                entityName={entityName}
                views={viewsQuery.data?.views ?? []}
                loading={viewsQuery.isLoading}
                errorText={viewsQuery.isError ? toBulkWorkflowError(viewsQuery.error) : null}
                filter={viewFilter}
                onFilterChange={setViewFilter}
                sort={viewSort}
                onSortChange={setViewSort}
                selectedId={selectedViewKey}
                onSelect={selectView}
                onRetry={() => void viewsQuery.refetch()}
              />
            </Panel>
            <Separator aria-label="Resize panes" className={`h-1 cursor-row-resize ${separatorClass}`} />
            <Panel minSize="30%" className="flex min-h-0 min-w-0 flex-col bg-canvas">
              <QueryPanel
                fetchXml={fetchXml}
                onFetchXmlChange={editFetchXml}
                batchSize={batchSizeText}
                onBatchSizeChange={setBatchSizeText}
                onBatchSizeBlur={() => setBatchSizeText(String(batchSize))}
                delay={delayText}
                onDelayChange={setDelayText}
                onDelayBlur={() => setDelayText(String(delaySeconds))}
                realtime={workflow?.mode === "realtime"}
                canCount={!!workflow && fetchXml.trim().length > 0}
                counting={countMutation.isPending}
                onCount={runCount}
                matchedCount={matchedCount}
                countError={countError}
                canStart={startAllowed}
                onStart={() => {
                  setStartError(null);
                  setStartOpen(true);
                }}
              />
            </Panel>
          </Group>
        </Panel>
      </Group>
      {workflow && matchedCount != null ? (
        <StartModal
          open={startOpen}
          workflow={workflow}
          entityName={entityName}
          count={matchedCount}
          batchSize={batchSize}
          delaySeconds={delaySeconds}
          busy={startMutation.isPending}
          errorText={startError}
          onCancel={() => setStartOpen(false)}
          onConfirm={confirmStart}
        />
      ) : null}
    </>
  );
}
