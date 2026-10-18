import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { CapabilitiesDto } from "../model/contracts";
import { registrationKeys } from "./queryKeys";

export function useCapabilities(connectionId: string | null) {
  return useQuery({
    queryKey: registrationKeys.capabilities(connectionId ?? ""),
    queryFn: () =>
      apiGet<CapabilitiesDto>("/api/plugin-registration/capabilities", {
        meta: { connectionId: connectionId ?? undefined },
      }),
    enabled: !!connectionId,
  });
}
