import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../client";

export interface EntityInfo {
  logicalName: string;
  displayName: string;
  primaryIdAttribute: string;
  primaryNameAttribute: string;
  isCustom: boolean;
}

export function useEntities(connectionName: string | null) {
  return useQuery({
    queryKey: ["migration", "entities", connectionName],
    queryFn: () => apiGet<EntityInfo[]>("/api/migration/entities"),
    enabled: !!connectionName,
    staleTime: 5 * 60 * 1000,
  });
}
