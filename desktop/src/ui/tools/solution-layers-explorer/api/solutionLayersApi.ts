import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../../shared/api/client";
import type { EntityInfo } from "../../../shared/contracts/dataverse";
import type { ComponentsResponse, ComponentTypesResponse, LayersResponse } from "../model/types";
import { solutionLayersKeys } from "./queryKeys";

function connection(connectionName: string) {
  return { meta: { connectionName } };
}

export function useComponentTypes(connectionName: string | null) {
  return useQuery({
    queryKey: solutionLayersKeys.componentTypes(connectionName ?? ""),
    queryFn: () =>
      apiGet<ComponentTypesResponse>("/api/solution-layers/component-types", connection(connectionName ?? "")),
    enabled: !!connectionName,
  });
}

export function useTables(connectionName: string | null, enabled: boolean) {
  return useQuery({
    queryKey: solutionLayersKeys.tables(connectionName ?? ""),
    queryFn: () => apiGet<EntityInfo[]>("/api/metadata/entities", connection(connectionName ?? "")),
    enabled: !!connectionName && enabled,
  });
}

export function useComponentSearch(
  connectionName: string | null,
  componentType: number | null,
  search: string,
  entity: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: solutionLayersKeys.components(connectionName ?? "", componentType ?? 0, search, entity),
    queryFn: () => {
      const params = new URLSearchParams({ componentType: String(componentType) });
      if (search) params.set("search", search);
      if (entity) params.set("entity", entity);
      return apiGet<ComponentsResponse>(
        `/api/solution-layers/components?${params.toString()}`,
        connection(connectionName ?? ""),
      );
    },
    enabled: !!connectionName && componentType !== null && enabled,
  });
}

export function fetchLayers(connectionName: string, componentType: number, componentId: string) {
  const params = new URLSearchParams({ componentType: String(componentType), componentId });
  return apiGet<LayersResponse>(`/api/solution-layers/layers?${params.toString()}`, connection(connectionName));
}

export function useLayers(connectionName: string | null, componentType: number | null, componentId: string | null) {
  return useQuery({
    queryKey: solutionLayersKeys.layers(connectionName ?? "", componentType ?? 0, componentId ?? ""),
    queryFn: () => fetchLayers(connectionName ?? "", componentType ?? 0, componentId ?? ""),
    enabled: !!connectionName && componentType !== null && !!componentId,
  });
}

/** Removes the Active layer of one component and returns its refreshed layers. Never replayed. */
export function removeActiveLayer(connectionName: string, componentType: number, componentId: string) {
  return apiPost<LayersResponse>(
    "/api/solution-layers/remove-active",
    { componentType, componentId },
    { meta: { connectionName, noAuthRetry: true } },
  );
}
