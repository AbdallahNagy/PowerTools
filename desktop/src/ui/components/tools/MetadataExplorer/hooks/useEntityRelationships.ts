import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../../api/client";
import type { RelationshipMetadata } from "../model/types";

export function useEntityRelationships(
  logicalName: string | null,
  connectionName: string | null,
) {
  return useQuery({
    queryKey: ["metadata", "relationships", connectionName, logicalName],
    queryFn: () =>
      apiGet<RelationshipMetadata[]>(
        `/api/metadata/entities/${logicalName}/relationships`,
        { meta: { connectionName: connectionName ?? undefined } },
      ),
    enabled: !!logicalName && !!connectionName,
    staleTime: 10 * 60 * 1000,
  });
}
