import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../../api/client";
import type { FieldMetadata } from "../model/types";

export function useTableMetadata(
  logicalName: string | null,
  connectionName: string | null
) {
  return useQuery({
    queryKey: ["metadata", "attributes", connectionName, logicalName],
    queryFn: () =>
      apiGet<FieldMetadata[]>(
        `/api/metadata/entities/${logicalName}/attributes`,
        { meta: { connectionName: connectionName ?? undefined } }
      ),
    enabled: !!logicalName && !!connectionName,
    staleTime: 10 * 60 * 1000,
  });
}
