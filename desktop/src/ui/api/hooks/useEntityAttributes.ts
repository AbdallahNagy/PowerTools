import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../client";

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
  connectionName: string | null
) {
  return useQuery({
    queryKey: ["migration", "attributes", connectionName, logicalName],
    queryFn: () =>
      apiGet<AttributeInfo[]>(
        `/api/migration/entities/${logicalName}/attributes`,
        { meta: { connectionName: connectionName ?? undefined } }
      ),
    enabled: !!logicalName && !!connectionName,
    staleTime: 5 * 60 * 1000,
  });
}
