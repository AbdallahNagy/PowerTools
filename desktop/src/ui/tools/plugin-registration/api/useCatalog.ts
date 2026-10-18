import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { CatalogDto } from "../model/contracts";
import { registrationKeys } from "./queryKeys";

export function useCatalog(connectionId: string | null) {
  return useQuery({
    queryKey: registrationKeys.catalog(connectionId ?? ""),
    queryFn: () =>
      apiGet<CatalogDto>("/api/plugin-registration/catalog", {
        meta: { connectionId: connectionId ?? undefined },
      }),
    enabled: !!connectionId,
  });
}
