import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { ActivityProcessesResponse, WorkflowActivitiesResponse } from "../model/types";
import { workflowActivityKeys } from "./queryKeys";

function connection(connectionId: string) {
  return { meta: { connectionId } };
}

export function useWorkflowActivities(connectionId: string | null) {
  return useQuery({
    queryKey: workflowActivityKeys.activities(connectionId ?? ""),
    queryFn: () =>
      apiGet<WorkflowActivitiesResponse>("/api/workflow-activities", connection(connectionId ?? "")),
    enabled: !!connectionId,
  });
}

export function fetchActivityProcesses(connectionId: string, pluginTypeId: string) {
  return apiGet<ActivityProcessesResponse>(
    `/api/workflow-activities/${encodeURIComponent(pluginTypeId)}/processes`,
    connection(connectionId),
  );
}

export function useActivityProcesses(connectionId: string | null, pluginTypeId: string | null) {
  return useQuery({
    queryKey: workflowActivityKeys.processes(connectionId ?? "", pluginTypeId ?? ""),
    queryFn: () => fetchActivityProcesses(connectionId ?? "", pluginTypeId ?? ""),
    enabled: !!connectionId && !!pluginTypeId,
  });
}
