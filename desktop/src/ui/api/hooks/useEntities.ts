import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../client";
import type { EntityInfo } from "../../shared/contracts/dataverse";

export function useEntities(connectionName: string | null) {
  return useQuery({
    queryKey: ["migration", "entities", connectionName],
    queryFn: () =>
      apiGet<EntityInfo[]>("/api/metadata/entities", {
        meta: { connectionName: connectionName ?? undefined },
      }),
    enabled: !!connectionName,
    staleTime: 5 * 60 * 1000,
  });
}
