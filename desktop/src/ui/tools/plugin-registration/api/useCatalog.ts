import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { CatalogDto } from "../model/contracts";
import { registrationKeys } from "./queryKeys";

export function useCatalog(connectionName: string | null) {
  return useQuery({
    queryKey: registrationKeys.catalog(connectionName ?? ""),
    queryFn: () =>
      apiGet<CatalogDto>("/api/plugin-registration/catalog", {
        meta: { connectionName: connectionName ?? undefined },
      }),
    enabled: !!connectionName,
  });
}
