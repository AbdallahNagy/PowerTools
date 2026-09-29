import { useQuery } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "../../../shared/api/client";
import type {
  PolymorphicMetadata,
  RelationshipPayload,
  UnmanagedSolution,
} from "../model/types";
import { polymorphicKeys } from "./queryKeys";

function connection(connectionName: string) {
  return { meta: { connectionName } };
}

export function useUnmanagedSolutions(connectionName: string | null) {
  return useQuery({
    queryKey: polymorphicKeys.solutions(connectionName ?? ""),
    queryFn: () =>
      apiGet<UnmanagedSolution[]>("/api/polymorphic-lookups/solutions", connection(connectionName ?? "")),
    enabled: !!connectionName,
  });
}

export function usePolymorphicMetadata(connectionName: string | null, enabled: boolean) {
  return useQuery({
    queryKey: polymorphicKeys.metadata(connectionName ?? ""),
    queryFn: () =>
      apiGet<PolymorphicMetadata>("/api/polymorphic-lookups/metadata", connection(connectionName ?? "")),
    enabled: !!connectionName && enabled,
  });
}

export function createLookup(
  connectionName: string,
  body: {
    solutionUniqueName: string;
    referencingEntityLogicalName: string;
    displayName: string;
    schemaName: string;
    relationships: RelationshipPayload[];
  },
) {
  return apiPost<{ attributeId: string }>("/api/polymorphic-lookups", body, connection(connectionName));
}

export function addRelationship(
  connectionName: string,
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
    connection(connectionName),
  );
}

export function updateRelationship(
  connectionName: string,
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
    connection(connectionName),
  );
}

export function deleteRelationship(
  connectionName: string,
  schemaName: string,
  referencingEntityLogicalName: string,
) {
  const query = new URLSearchParams({ referencingEntityLogicalName });
  return apiDelete<{ schemaName: string }>(
    `/api/polymorphic-lookups/relationships/${encodeURIComponent(schemaName)}?${query.toString()}`,
    connection(connectionName),
  );
}

export function deleteLookupColumn(
  connectionName: string,
  entityLogicalName: string,
  attributeLogicalName: string,
) {
  return apiDelete<{ schemaName: string }>(
    `/api/polymorphic-lookups/${encodeURIComponent(entityLogicalName)}/${encodeURIComponent(attributeLogicalName)}`,
    connection(connectionName),
  );
}
