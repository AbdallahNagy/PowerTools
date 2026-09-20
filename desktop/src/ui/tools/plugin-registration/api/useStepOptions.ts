import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { StepOptionsDto } from "../model/contracts";
import { registrationKeys } from "./queryKeys";

/** Messages, filters, and users barely change; Refresh still refetches. */
export const STEP_OPTIONS_STALE_TIME = Number.POSITIVE_INFINITY;

export function useStepOptions(connectionName: string | null) {
  return useQuery({
    queryKey: registrationKeys.stepOptions(connectionName ?? ""),
    queryFn: () =>
      apiGet<StepOptionsDto>("/api/plugin-registration/step-options", {
        meta: { connectionName: connectionName ?? undefined },
      }),
    enabled: !!connectionName,
    staleTime: STEP_OPTIONS_STALE_TIME,
    gcTime: STEP_OPTIONS_STALE_TIME,
  });
}
