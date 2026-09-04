import { useQuery } from "@tanstack/react-query";

import { apiGet } from "../../../shared/api/client";
import {
  normalizePluginHandler,
  type PluginHandlerDto,
} from "../model/contracts";

export function useWorkflowActivityDetails(
  connectionName: string | null,
  workflowActivityId: string | null,
) {
  return useQuery({
    queryKey: [
      "plugin-registration",
      "workflow-activity-details",
      connectionName,
      workflowActivityId,
    ],
    queryFn: ({ signal }) =>
      apiGet<PluginHandlerDto>(
        `/api/plugin-registration/workflow-activities/${workflowActivityId}/details`,
        {
          signal,
          meta: { connectionName: connectionName ?? undefined },
        },
      ).then(normalizePluginHandler),
    enabled: Boolean(connectionName && workflowActivityId),
    staleTime: 30_000,
  });
}
