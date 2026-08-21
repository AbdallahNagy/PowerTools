import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { EntityInfo } from "../../../shared/contracts/dataverse";

export function useTables(connectionName: string | null) {
  return useQuery({
    queryKey: ["metadata", "entities", connectionName],
    queryFn: () =>
      apiGet<EntityInfo[]>("/api/metadata/entities", {
        meta: { connectionName: connectionName ?? undefined },
      }),
    enabled: !!connectionName,
    staleTime: 10 * 60 * 1000,
  });
}
