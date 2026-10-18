import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { EntityInfo } from "../../../shared/contracts/dataverse";

export function useTables(connectionId: string | null) {
  return useQuery({
    queryKey: ["metadata", "entities", connectionId],
    queryFn: () =>
      apiGet<EntityInfo[]>("/api/metadata/entities", {
        meta: { connectionId: connectionId ?? undefined },
      }),
    enabled: !!connectionId,
    staleTime: 10 * 60 * 1000,
  });
}
