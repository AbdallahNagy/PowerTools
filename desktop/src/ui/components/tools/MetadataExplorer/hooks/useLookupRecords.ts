import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiPost } from "../../../../api/client";
import type { EntityInfo, FetchResult } from "../model/types";
import { buildLookupFetchXml } from "../model/lookupFetchXml";

export interface LookupRecord {
  id: string;
  name: string;
  createdOn?: string;
}

export function useLookupRecords(
  connectionName: string | null,
  entity: EntityInfo | null,
  search: string,
) {
  const fetchXml = useMemo(
    () => (entity ? buildLookupFetchXml(entity, search) : ""),
    [entity, search],
  );

  return useQuery({
    queryKey: ["lookup-records", connectionName, entity?.logicalName, search],
    queryFn: async () => {
      if (!entity) return [];

      const result = await apiPost<FetchResult>(
        "/api/fetch/execute",
        { fetchXml, page: 1, pageSize: 50 },
        { meta: { connectionName: connectionName ?? undefined } },
      );

      return result.records.map((row) => {
        const rawName = row[entity.primaryNameAttribute];
        return {
          id: String(row.id ?? row[entity.primaryIdAttribute] ?? ""),
          name: rawName == null || rawName === "" ? String(row.id ?? "") : String(rawName),
          createdOn: row.createdon == null ? undefined : String(row.createdon),
        };
      }).filter((record) => record.id);
    },
    enabled: !!connectionName && !!entity,
    staleTime: 30 * 1000,
  });
}
