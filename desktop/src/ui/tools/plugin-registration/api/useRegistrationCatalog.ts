import { useQuery } from "@tanstack/react-query";

import { apiGet } from "../../../shared/api/client";
import type { PluginRegistrationCatalog } from "../model/contracts";

export function useRegistrationCatalog(connectionName: string | null) {
  return useQuery({
    queryKey: ["plugin-registration", "catalog", connectionName],
    queryFn: ({ signal }) =>
      apiGet<PluginRegistrationCatalog>("/api/plugin-registration/catalog", {
        signal,
        meta: { connectionName: connectionName ?? undefined },
      }),
    enabled: Boolean(connectionName),
    staleTime: 30_000,
  });
}
