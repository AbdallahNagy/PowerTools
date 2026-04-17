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

export function useEntityAttributes(logicalName: string | null) {
  return useQuery({
    queryKey: ["migration", "attributes", logicalName],
    queryFn: () =>
      apiGet<AttributeInfo[]>(`/api/migration/entities/${logicalName}/attributes`),
    enabled: !!logicalName,
    staleTime: 5 * 60 * 1000,
  });
}
