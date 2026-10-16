import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { RelationshipMetadata } from "../model/types";

export function useEntityRelationships(
  logicalName: string | null,
  connectionId: string | null,
) {
  return useQuery({
    queryKey: ["metadata", "relationships", connectionId, logicalName],
    queryFn: () =>
      apiGet<RelationshipMetadata[]>(
        `/api/metadata/entities/${logicalName}/relationships`,
        { meta: { connectionId: connectionId ?? undefined } },
      ),
    enabled: !!logicalName && !!connectionId,
    staleTime: 10 * 60 * 1000,
  });
}
