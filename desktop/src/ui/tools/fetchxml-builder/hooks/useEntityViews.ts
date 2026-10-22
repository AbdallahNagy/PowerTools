import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { EntityView } from "../model/types";

export function useEntityViews(
  logicalName: string | null,
  connectionId: string | null,
) {
  return useQuery({
    queryKey: ["metadata", "views", connectionId, logicalName],
    queryFn: () =>
      apiGet<EntityView[]>(
        `/api/metadata/entities/${logicalName}/views`,
        { meta: { connectionId: connectionId ?? undefined } },
      ),
    enabled: !!logicalName && !!connectionId,
    staleTime: 10 * 60 * 1000,
  });
}
