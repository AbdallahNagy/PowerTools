import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { TableAttributesResponse, TablesResponse } from "../model/types";
import { attributeExplorerKeys } from "./queryKeys";

function connection(connectionId: string) {
  return { meta: { connectionId } };
}

/**
 * Metadata is cached for the tab session. Only Refresh metadata refetches.
 * No automatic retry: a throttled or missing table should surface at once.
 */
export function useTables(connectionId: string | null) {
  return useQuery({
    queryKey: attributeExplorerKeys.tables(connectionId ?? ""),
    queryFn: () =>
      apiGet<TablesResponse>("/api/attribute-explorer/tables", connection(connectionId ?? "")),
    enabled: !!connectionId,
    staleTime: Infinity,
    retry: false,
  });
}

export function useTableAttributes(connectionId: string | null, logicalName: string | null) {
  return useQuery({
    queryKey: attributeExplorerKeys.attributes(connectionId ?? "", logicalName ?? ""),
    queryFn: () =>
      apiGet<TableAttributesResponse>(
        `/api/attribute-explorer/tables/${encodeURIComponent(logicalName ?? "")}/attributes`,
        connection(connectionId ?? ""),
      ),
    enabled: !!connectionId && !!logicalName,
    staleTime: Infinity,
    retry: false,
  });
}
