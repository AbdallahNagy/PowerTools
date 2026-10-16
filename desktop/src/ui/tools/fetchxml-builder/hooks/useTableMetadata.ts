import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { FieldMetadata } from "../model/types";

export function useTableMetadata(
  logicalName: string | null,
  connectionId: string | null
) {
  return useQuery({
    queryKey: ["metadata", "attributes", connectionId, logicalName],
    queryFn: () =>
      apiGet<FieldMetadata[]>(
        `/api/metadata/entities/${logicalName}/attributes`,
        { meta: { connectionId: connectionId ?? undefined } }
      ),
    enabled: !!logicalName && !!connectionId,
    staleTime: 10 * 60 * 1000,
  });
}
