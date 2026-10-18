import { useQuery } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "../../../shared/api/client";
import type {
  PolymorphicMetadata,
  RelationshipPayload,
  UnmanagedSolution,
} from "../model/types";
import { polymorphicKeys } from "./queryKeys";

function connection(connectionId: string) {
  return { meta: { connectionId } };
}

export function useUnmanagedSolutions(connectionId: string | null) {
  return useQuery({
    queryKey: polymorphicKeys.solutions(connectionId ?? ""),
    queryFn: () =>
      apiGet<UnmanagedSolution[]>("/api/polymorphic-lookups/solutions", connection(connectionId ?? "")),
    enabled: !!connectionId,
  });
}

export function usePolymorphicMetadata(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: polymorphicKeys.metadata(connectionId ?? ""),
    queryFn: () =>
      apiGet<PolymorphicMetadata>("/api/polymorphic-lookups/metadata", connection(connectionId ?? "")),
    enabled: !!connectionId && enabled,
  });
}

export function createLookup(
  connectionId: string,
  body: {
    solutionUniqueName: string;
    referencingEntityLogicalName: string;
    displayName: string;
    schemaName: string;
    relationships: RelationshipPayload[];
  },
) {
  return apiPost<{ attributeId: string }>("/api/polymorphic-lookups", body, connection(connectionId));
}

export function addRelationship(
  connectionId: string,
  body: {
    solutionUniqueName: string;
    referencingEntityLogicalName: string;
    referencingAttributeLogicalName: string;
    relationship: RelationshipPayload;
  },
) {
  return apiPost<{ schemaName: string }>(
    "/api/polymorphic-lookups/relationships",
    body,
    connection(connectionId),
  );
}

export function updateRelationship(
  connectionId: string,
  schemaName: string,
  body: {
    referencingEntityLogicalName: string;
    isValidForAdvancedFind: boolean;
    cascade: RelationshipPayload["cascade"];
    associatedMenuBehavior: string;
    associatedMenuGroup: string;
    associatedMenuOrder: number;
    associatedMenuLabel: string | null;
  },
) {
  return apiPut<{ schemaName: string }>(
    `/api/polymorphic-lookups/relationships/${encodeURIComponent(schemaName)}`,
    body,
    connection(connectionId),
  );
}

export function deleteRelationship(
  connectionId: string,
  schemaName: string,
  referencingEntityLogicalName: string,
) {
  const query = new URLSearchParams({ referencingEntityLogicalName });
  return apiDelete<{ schemaName: string }>(
    `/api/polymorphic-lookups/relationships/${encodeURIComponent(schemaName)}?${query.toString()}`,
    connection(connectionId),
  );
}

export function deleteLookupColumn(
  connectionId: string,
  entityLogicalName: string,
  attributeLogicalName: string,
) {
  return apiDelete<{ schemaName: string }>(
    `/api/polymorphic-lookups/${encodeURIComponent(entityLogicalName)}/${encodeURIComponent(attributeLogicalName)}`,
    connection(connectionId),
  );
}
