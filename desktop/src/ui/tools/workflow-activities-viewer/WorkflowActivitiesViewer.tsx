import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useTabConnection } from "../../shared/connections";
import { useToolStatus } from "../../shared/status";
import { Button, DataTable, SearchInput, Spinner, ToastProvider, useToast } from "../../shared/ui";
import { fetchActivityProcesses, useActivityProcesses, useWorkflowActivities } from "./api/workflowActivitiesApi";
import { workflowActivityKeys } from "./api/queryKeys";
import { toWorkflowActivitiesError } from "./model/apiError";
import type { Activity, ProcessRow } from "./model/types";
import {
  activityStatusName,
  activityTotals,
  filterAssemblies,
  findActivity,
  formatTimestamp,
  isGroupExpanded,
  startConditionsText,
} from "./model/view";

const noEnvironmentMessage =
  "Right-click this tab and choose Change connection.";

const processColumns = [
  { key: "name", header: "Process", render: (row: ProcessRow) => row.name },
  { key: "category", header: "Category", render: (row: ProcessRow) => row.categoryLabel },
  { key: "primary", header: "Primary table", render: (row: ProcessRow) => row.primaryEntity },
  {
    key: "created",
    header: "Created on",
    render: (row: ProcessRow) => formatTimestamp(row.createdOn) ?? "",
  },
  {
    key: "modified",
    header: "Modified on",
    render: (row: ProcessRow) => formatTimestamp(row.modifiedOn) ?? "",
  },
  { key: "start", header: "Start conditions", render: (row: ProcessRow) => startConditionsText(row) },
];

export default function WorkflowActivitiesViewer() {
  return (
    <ToastProvider>
      <WorkflowActivitiesPage />
    </ToastProvider>
  );
}

function WorkflowActivitiesPage() {
  const { connectionName } = useTabConnection();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    setFilter("");
    setExpanded(new Set());
    setSelectedId(null);
  }, [connectionName]);

  const activitiesQuery = useWorkflowActivities(connectionName || null);
  const assemblies = activitiesQuery.data?.assemblies ?? [];
  const selected = useMemo(
    () => (activitiesQuery.isError ? null : findActivity(activitiesQuery.data?.assemblies ?? [], selectedId)),
    [activitiesQuery.data, activitiesQuery.isError, selectedId],
  );
  const processesQuery = useActivityProcesses(
    connectionName || null,
    selected?.pluginTypeId ?? null,
  );

  useEffect(() => {
    if (!activitiesQuery.isError) return;
    showToast(toWorkflowActivitiesError(activitiesQuery.error), "error");
  }, [activitiesQuery.error, activitiesQuery.isError, showToast]);

  useEffect(() => {
    if (!processesQuery.isError) return;
    showToast(toWorkflowActivitiesError(processesQuery.error), "error");
  }, [processesQuery.error, processesQuery.isError, showToast]);

  const status = useMemo(() => {
    if (!connectionName) return "No environment selected";
    if (activitiesQuery.isFetching) return "Loading workflow activities…";
    if (activitiesQuery.isError) return "Could not load workflow activities";
    if (selected && processesQuery.isFetching) return "Loading processes…";
    if (selected && processesQuery.isError) {
      return `${activityStatusName(selected.name)}: could not load processes`;
    }
    if (selected && !processesQuery.data) return "Loading processes…";
    if (selected && processesQuery.data) {
      const label = activityStatusName(selected.name);
      const count = processesQuery.data.processes.length;
      return count === 0 ? `${label}: no matching processes` : `${label}: ${count} activated processes`;
    }
    if (activitiesQuery.data) {
      const totals = activityTotals(activitiesQuery.data.assemblies);
      return `${totals.activities} activities in ${totals.assemblies} assemblies`;
    }
    return "No environment selected";
  }, [
    activitiesQuery.data,
    activitiesQuery.isError,
    activitiesQuery.isFetching,
    connectionName,
    processesQuery.data,
    processesQuery.isError,
    processesQuery.isFetching,
    selected,
  ]);
  useToolStatus(status);

  const visible = filterAssemblies(assemblies, filter);
  const busy = activitiesQuery.isFetching || (!!selected && processesQuery.isFetching);

  const onFilterChange = (value: string) => {
    setFilter(value);
    if (value.length === 0) setExpanded(new Set());
  };

  const toggleGroup = (assemblyId: string) => {
    if (filter.length > 0) return;
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(assemblyId)) next.delete(assemblyId);
      else next.add(assemblyId);
      return next;
    });
  };

  const refresh = async () => {
    const id = selectedIdRef.current;
    const result = await activitiesQuery.refetch();
    if (result.isError || !result.data || !connectionName) return;
    if (!id) return;
    if (!findActivity(result.data.assemblies, id)) {
      setSelectedId(null);
      return;
    }
    await queryClient.fetchQuery({
      queryKey: workflowActivityKeys.processes(connectionName, id),
      queryFn: () => fetchActivityProcesses(connectionName, id),
    });
  };

  return (
    <Group orientation="horizontal" className="flex min-h-0 flex-1 bg-canvas">
      <Panel defaultSize="50%" minSize="20%" className="flex min-h-0 min-w-0 flex-col bg-surface">
        <div className="flex shrink-0 items-center gap-2 border-b border-line p-3">
          <fieldset disabled={!connectionName} className="m-0 min-w-0 flex-1 border-0 p-0">
            <SearchInput
              value={filter}
              onChange={onFilterChange}
              placeholder="Filter by activity name"
            />
          </fieldset>
          <Button type="button" variant="secondary" onClick={() => void refresh()} disabled={!connectionName || busy}>
            Refresh
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <AssemblyList
            connectionName={connectionName ?? ""}
            loading={activitiesQuery.isFetching}
            errorText={activitiesQuery.isError ? toWorkflowActivitiesError(activitiesQuery.error) : null}
            assemblies={visible}
            totalAssemblies={assemblies.length}
            filter={filter}
            expanded={expanded}
            selectedId={selected?.pluginTypeId ?? null}
            onToggle={toggleGroup}
            onSelect={setSelectedId}
            onRetry={() => void refresh()}
          />
        </div>
      </Panel>
      <Separator
        aria-label="Resize panes"
        className="w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent"
      />
      <Panel minSize="20%" className="flex min-h-0 min-w-0 flex-col bg-surface">
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {!connectionName ? (
            <p className="text-fg-muted">{noEnvironmentMessage}</p>
          ) : !selected ? (
            <p className="text-fg-muted">Select an activity.</p>
          ) : (
            <ActivityDetail
              activity={selected}
              loading={processesQuery.isFetching || (!processesQuery.data && !processesQuery.isError)}
              errorText={processesQuery.isError ? toWorkflowActivitiesError(processesQuery.error) : null}
              processes={processesQuery.data?.processes ?? []}
              truncated={processesQuery.data?.truncated ?? false}
              onRetry={() => void processesQuery.refetch()}
            />
          )}
        </div>
      </Panel>
    </Group>
  );
}

function AssemblyList({
  connectionName,
  loading,
  errorText,
  assemblies,
  totalAssemblies,
  filter,
  expanded,
  selectedId,
  onToggle,
  onSelect,
  onRetry,
}: {
  connectionName: string;
  loading: boolean;
  errorText: string | null;
  assemblies: ReturnType<typeof filterAssemblies>;
  totalAssemblies: number;
  filter: string;
  expanded: ReadonlySet<string>;
  selectedId: string | null;
  onToggle: (assemblyId: string) => void;
  onSelect: (pluginTypeId: string) => void;
  onRetry: () => void;
}) {
  if (!connectionName) {
    return <p className="text-fg-muted">{noEnvironmentMessage}</p>;
  }
  if (loading) {
    return (
      <div role="status" aria-label="Loading workflow activities">
        <Spinner />
      </div>
    );
  }
  if (errorText) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-fg">{errorText}</p>
        <Button type="button" variant="secondary" onClick={onRetry}>Retry</Button>
      </div>
    );
  }
  if (totalAssemblies === 0) {
    return (
      <p className="text-fg-muted">
        No custom workflow activities in database-stored assemblies.
      </p>
    );
  }
  if (assemblies.length === 0) {
    return <p className="text-fg-muted">No activities match this filter.</p>;
  }

  return (
    <div>
      {assemblies.map((group) => {
        const open = isGroupExpanded(group.assemblyId, filter, expanded);
        const label = group.name.trim() ? group.name : "Unknown";
        return (
          <div key={group.assemblyId}>
            <button
              type="button"
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-hover"
              onClick={() => onToggle(group.assemblyId)}
            >
              <span className={group.name.trim() ? "truncate text-fg-strong" : "truncate text-fg-muted"}>
                {label}
              </span>
              <span className="text-fg-muted">
                {group.activities.length}
                <span className="sr-only"> activities</span>
              </span>
            </button>
            {open ? (
              <div>
                {group.activities.map((activity) => {
                  const selected = activity.pluginTypeId === selectedId;
                  return (
                    <button
                      key={activity.pluginTypeId}
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      className={`block w-full px-6 py-1.5 text-left ${
                        selected
                          ? "bg-hover text-fg-strong"
                          : "text-fg hover:bg-hover"
                      }`}
                      onClick={() => onSelect(activity.pluginTypeId)}
                    >
                      {activity.name.trim() ? activity.name : "Unknown"}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ActivityDetail({
  activity,
  loading,
  errorText,
  processes,
  truncated,
  onRetry,
}: {
  activity: Activity;
  loading: boolean;
  errorText: string | null;
  processes: ProcessRow[];
  truncated: boolean;
  onRetry: () => void;
}) {
  const name = activity.name.trim() ? activity.name : "";
  return (
    <div className="flex flex-col gap-4">
      <h2 className={name ? "text-base text-fg-strong" : "text-base text-fg-muted"}>
        {name || "Unknown"}
      </h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <DetailField label="Created on" value={formatTimestamp(activity.createdOn)} />
        <DetailField label="Created by" value={activity.createdBy} />
        <DetailField label="Modified on" value={formatTimestamp(activity.modifiedOn)} />
        <DetailField label="Modified by" value={activity.modifiedBy} />
      </dl>
      <ArgumentSection title="Input arguments" empty="No input arguments" names={activity.inputs.map((item) => item.name)} />
      <ArgumentSection title="Output arguments" empty="No output arguments" names={activity.outputs.map((item) => item.name)} />
      <div>
        {loading ? (
          <div role="status" aria-label="Loading processes">
            <Spinner />
          </div>
        ) : errorText ? (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-fg">{errorText}</p>
            <Button type="button" variant="secondary" onClick={onRetry}>Retry</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {truncated ? (
              <p className="text-fg-muted">The process list stopped early.</p>
            ) : null}
            <DataTable
              columns={processColumns}
              rows={processes}
              getRowKey={(row) => row.workflowId || row.name}
              emptyMessage="No activated process references this activity."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | null }) {
  const missing = !value || value.trim().length === 0;
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className={missing ? "text-fg-muted" : "text-fg"}>
        {missing ? "Unknown" : value}
      </dd>
    </>
  );
}

function ArgumentSection({ title, empty, names }: { title: string; empty: string; names: string[] }) {
  return (
    <section>
      <h3 className="text-fg-muted">{title}</h3>
      {names.length === 0 ? (
        <p className="text-fg-muted">{empty}</p>
      ) : (
        <ul>
          {names.map((name, index) => (
            <li key={`${name}-${index}`} className="text-fg">{name}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
