import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { EntityInfo } from "../../../shared/contracts/dataverse";

export function useEntities(connectionId: string | null) {
  return useQuery({
    queryKey: ["migration", "entities", connectionId],
    queryFn: () =>
      apiGet<EntityInfo[]>("/api/metadata/entities", {
        meta: { connectionId: connectionId ?? undefined },
      }),
    enabled: !!connectionId,
    staleTime: 5 * 60 * 1000,
  });
}
