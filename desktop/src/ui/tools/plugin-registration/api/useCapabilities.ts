import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { CapabilitiesDto } from "../model/contracts";
import { registrationKeys } from "./queryKeys";

export function useCapabilities(connectionName: string | null) {
  return useQuery({
    queryKey: registrationKeys.capabilities(connectionName ?? ""),
    queryFn: () =>
      apiGet<CapabilitiesDto>("/api/plugin-registration/capabilities", {
        meta: { connectionName: connectionName ?? undefined },
      }),
    enabled: !!connectionName,
  });
}
