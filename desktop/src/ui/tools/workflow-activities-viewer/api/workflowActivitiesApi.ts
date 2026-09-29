import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { ActivityProcessesResponse, WorkflowActivitiesResponse } from "../model/types";
import { workflowActivityKeys } from "./queryKeys";

function connection(connectionName: string) {
  return { meta: { connectionName } };
}

export function useWorkflowActivities(connectionName: string | null) {
  return useQuery({
    queryKey: workflowActivityKeys.activities(connectionName ?? ""),
    queryFn: () =>
      apiGet<WorkflowActivitiesResponse>("/api/workflow-activities", connection(connectionName ?? "")),
    enabled: !!connectionName,
  });
}

export function fetchActivityProcesses(connectionName: string, pluginTypeId: string) {
  return apiGet<ActivityProcessesResponse>(
    `/api/workflow-activities/${encodeURIComponent(pluginTypeId)}/processes`,
    connection(connectionName),
  );
}

export function useActivityProcesses(connectionName: string | null, pluginTypeId: string | null) {
  return useQuery({
    queryKey: workflowActivityKeys.processes(connectionName ?? "", pluginTypeId ?? ""),
    queryFn: () => fetchActivityProcesses(connectionName ?? "", pluginTypeId ?? ""),
    enabled: !!connectionName && !!pluginTypeId,
  });
}
