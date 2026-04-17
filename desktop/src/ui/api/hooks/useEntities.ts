import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../client";

export interface EntityInfo {
  logicalName: string;
  displayName: string;
  primaryIdAttribute: string;
  primaryNameAttribute: string;
  isCustom: boolean;
}

export function useEntities(enabled = false) {
  return useQuery({
    queryKey: ["migration", "entities"],
    queryFn: () => apiGet<EntityInfo[]>("/api/migration/entities"),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
