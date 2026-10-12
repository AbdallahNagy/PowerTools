import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../../shared/api/client";
import type { GenerateRequest, GenerateResponse, TablesResponse } from "../model/types";
import { earlyBoundKeys } from "./queryKeys";

function connection(connectionName: string) {
  return { meta: { connectionName } };
}

/** Table list is cached for the tab session. Refresh refetches it. */
export function useTables(connectionName: string | null) {
  return useQuery({
    queryKey: earlyBoundKeys.tables(connectionName ?? ""),
    queryFn: () => apiGet<TablesResponse>("/api/early-bound/tables", connection(connectionName ?? "")),
    enabled: !!connectionName,
    staleTime: Infinity,
    retry: false,
  });
}

export function generateCode(connectionName: string, request: GenerateRequest) {
  return apiPost<GenerateResponse>("/api/early-bound/generate", request, connection(connectionName));
}
