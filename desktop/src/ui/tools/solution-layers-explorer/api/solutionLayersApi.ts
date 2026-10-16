import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../../shared/api/client";
import type { EntityInfo } from "../../../shared/contracts/dataverse";
import type { ComponentsResponse, ComponentTypesResponse, LayersResponse } from "../model/types";
import { solutionLayersKeys } from "./queryKeys";

function connection(connectionId: string) {
  return { meta: { connectionId } };
}

export function useComponentTypes(connectionId: string | null) {
  return useQuery({
    queryKey: solutionLayersKeys.componentTypes(connectionId ?? ""),
    queryFn: () =>
      apiGet<ComponentTypesResponse>("/api/solution-layers/component-types", connection(connectionId ?? "")),
    enabled: !!connectionId,
  });
}

export function useTables(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: solutionLayersKeys.tables(connectionId ?? ""),
    queryFn: () => apiGet<EntityInfo[]>("/api/metadata/entities", connection(connectionId ?? "")),
    enabled: !!connectionId && enabled,
  });
}

export function useComponentSearch(
  connectionId: string | null,
  componentType: number | null,
  search: string,
  entity: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: solutionLayersKeys.components(connectionId ?? "", componentType ?? 0, search, entity),
    queryFn: () => {
      const params = new URLSearchParams({ componentType: String(componentType) });
      if (search) params.set("search", search);
      if (entity) params.set("entity", entity);
      return apiGet<ComponentsResponse>(
        `/api/solution-layers/components?${params.toString()}`,
        connection(connectionId ?? ""),
      );
    },
    enabled: !!connectionId && componentType !== null && enabled,
  });
}

export function fetchLayers(connectionId: string, componentType: number, componentId: string) {
  const params = new URLSearchParams({ componentType: String(componentType), componentId });
  return apiGet<LayersResponse>(`/api/solution-layers/layers?${params.toString()}`, connection(connectionId));
}

export function useLayers(connectionId: string | null, componentType: number | null, componentId: string | null) {
  return useQuery({
    queryKey: solutionLayersKeys.layers(connectionId ?? "", componentType ?? 0, componentId ?? ""),
    queryFn: () => fetchLayers(connectionId ?? "", componentType ?? 0, componentId ?? ""),
    enabled: !!connectionId && componentType !== null && !!componentId,
  });
}

/** Removes the Active layer of one component and returns its refreshed layers. Never replayed. */
export function removeActiveLayer(connectionId: string, componentType: number, componentId: string) {
  return apiPost<LayersResponse>(
    "/api/solution-layers/remove-active",
    { componentType, componentId },
    { meta: { connectionId, noAuthRetry: true } },
  );
}
