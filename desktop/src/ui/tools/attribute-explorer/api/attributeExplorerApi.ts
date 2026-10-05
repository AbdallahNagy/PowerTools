import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { TableAttributesResponse, TablesResponse } from "../model/types";
import { attributeExplorerKeys } from "./queryKeys";

function connection(connectionName: string) {
  return { meta: { connectionName } };
}

/** Metadata is cached for the tab session. Only Refresh metadata refetches. */
export function useTables(connectionName: string | null) {
  return useQuery({
    queryKey: attributeExplorerKeys.tables(connectionName ?? ""),
    queryFn: () =>
      apiGet<TablesResponse>("/api/attribute-explorer/tables", connection(connectionName ?? "")),
    enabled: !!connectionName,
    staleTime: Infinity,
  });
}

export function useTableAttributes(connectionName: string | null, logicalName: string | null) {
  return useQuery({
    queryKey: attributeExplorerKeys.attributes(connectionName ?? "", logicalName ?? ""),
    queryFn: () =>
      apiGet<TableAttributesResponse>(
        `/api/attribute-explorer/tables/${encodeURIComponent(logicalName ?? "")}/attributes`,
        connection(connectionName ?? ""),
      ),
    enabled: !!connectionName && !!logicalName,
    staleTime: Infinity,
  });
}
