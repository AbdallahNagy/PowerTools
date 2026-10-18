import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { StepOptionsDto } from "../model/contracts";
import { registrationKeys } from "./queryKeys";

/** Messages, filters, and users barely change; Refresh still refetches. */
export const STEP_OPTIONS_STALE_TIME = Number.POSITIVE_INFINITY;

export function useStepOptions(connectionId: string | null) {
  return useQuery({
    queryKey: registrationKeys.stepOptions(connectionId ?? ""),
    queryFn: () =>
      apiGet<StepOptionsDto>("/api/plugin-registration/step-options", {
        meta: { connectionId: connectionId ?? undefined },
      }),
    enabled: !!connectionId,
    staleTime: STEP_OPTIONS_STALE_TIME,
    gcTime: STEP_OPTIONS_STALE_TIME,
  });
}
