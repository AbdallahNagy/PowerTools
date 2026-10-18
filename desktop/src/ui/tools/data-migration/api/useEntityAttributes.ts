import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";

export interface AttributeInfo {
  logicalName: string;
  displayName: string;
  attributeType: string;
  isPrimaryId: boolean;
  isCustomAttribute: boolean;
  requiredLevel: string;
  isValidForCreate: boolean;
  isValidForUpdate: boolean;
}

export function useEntityAttributes(
  logicalName: string | null,
  connectionId: string | null
) {
  return useQuery({
    queryKey: ["migration", "attributes", connectionId, logicalName],
    queryFn: () =>
      apiGet<AttributeInfo[]>(
        `/api/metadata/entities/${logicalName}/attributes`,
        { meta: { connectionId: connectionId ?? undefined } }
      ),
    enabled: !!logicalName && !!connectionId,
    staleTime: 5 * 60 * 1000,
  });
}
