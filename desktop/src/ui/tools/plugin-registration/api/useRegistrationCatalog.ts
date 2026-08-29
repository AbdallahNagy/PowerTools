import { useQuery } from "@tanstack/react-query";

import { apiGet } from "../../../shared/api/client";
import {
  normalizePluginRegistrationCatalog,
  type PluginRegistrationCatalogDto,
} from "../model/contracts";

export function useRegistrationCatalog(connectionName: string | null) {
  return useQuery({
    queryKey: ["plugin-registration", "catalog", connectionName],
    queryFn: ({ signal }) =>
      apiGet<PluginRegistrationCatalogDto>("/api/plugin-registration/catalog", {
        signal,
        meta: { connectionName: connectionName ?? undefined },
      }).then(normalizePluginRegistrationCatalog),
    enabled: Boolean(connectionName),
    staleTime: 30_000,
  });
}
