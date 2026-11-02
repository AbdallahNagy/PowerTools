import { useQuery } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "../../../shared/api/client";
import type {
  CreateDefinitionBody,
  CreateDefinitionResponse,
  DeleteDefinitionResponse,
  EnvironmentVariable,
  SaveValueItem,
  SaveValuesResponse,
  SolutionOption,
  UpdateDefinitionBody,
} from "../model/types";
import { environmentVariablesKeys } from "./queryKeys";

const BASE = "/api/environment-variables";

function read(connectionId: string) {
  return { meta: { connectionId } };
}

/** Writes are not replayed after a token refresh, so a create or delete never runs twice. */
function write(connectionId: string) {
  return { meta: { connectionId, noAuthRetry: true } };
}

export function useEnvironmentVariables(connectionId: string | null) {
  return useQuery({
    queryKey: environmentVariablesKeys.list(connectionId ?? ""),
    queryFn: () => apiGet<EnvironmentVariable[]>(BASE, read(connectionId ?? "")),
    enabled: !!connectionId,
  });
}

export function useSolutions(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: environmentVariablesKeys.solutions(connectionId ?? ""),
    queryFn: () => apiGet<SolutionOption[]>(`${BASE}/solutions`, read(connectionId ?? "")),
    enabled: !!connectionId && enabled,
  });
}

export function saveValues(connectionId: string, items: SaveValueItem[]) {
  return apiPost<SaveValuesResponse>(`${BASE}/values`, { items }, write(connectionId));
}

export function deleteValue(connectionId: string, valueId: string) {
  return apiDelete<{ valueId: string }>(`${BASE}/values/${encodeURIComponent(valueId)}`, write(connectionId));
}

export function createDefinition(connectionId: string, body: CreateDefinitionBody) {
  return apiPost<CreateDefinitionResponse>(`${BASE}/definitions`, body, write(connectionId));
}

export function updateDefinition(connectionId: string, definitionId: string, body: UpdateDefinitionBody) {
  return apiPut<{ definitionId: string }>(
    `${BASE}/definitions/${encodeURIComponent(definitionId)}`,
    body,
    write(connectionId),
  );
}

export function deleteDefinition(connectionId: string, definitionId: string) {
  return apiDelete<DeleteDefinitionResponse>(
    `${BASE}/definitions/${encodeURIComponent(definitionId)}`,
    write(connectionId),
  );
}
