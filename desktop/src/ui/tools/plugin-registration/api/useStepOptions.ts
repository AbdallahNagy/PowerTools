import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { StepOptionsDto } from "../model/contracts";
import { registrationKeys } from "./queryKeys";

export function useStepOptions(connectionName: string | null) {
  return useQuery({
    queryKey: registrationKeys.stepOptions(connectionName ?? ""),
    queryFn: () =>
      apiGet<StepOptionsDto>("/api/plugin-registration/step-options", {
        meta: { connectionName: connectionName ?? undefined },
      }),
    enabled: !!connectionName,
  });
}
