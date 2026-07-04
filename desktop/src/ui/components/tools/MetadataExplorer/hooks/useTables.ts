import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../../api/client";
import type { EntityInfo } from "../model/types";

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
