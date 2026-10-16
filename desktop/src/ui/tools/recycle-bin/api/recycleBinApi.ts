import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../../shared/api/client";
import { dayEndUtc, dayStartUtc } from "../model/dates";
import type {
  AppliedSearch,
  AttributeInfo,
  BinCheckResponse,
  DeletedBody,
  DeletedRecord,
  DeletedResponse,
  RecordResponse,
  RestoreItem,
  RestoreResponse,
  Source,
  StatusResponse,
  TablesResponse,
  UsersResponse,
} from "../model/types";
import { recycleBinKeys } from "./queryKeys";

export const PAGE_SIZE = 100;
const METADATA_STALE_MS = 5 * 60 * 1000;

function connection(connectionName: string) {
  return { meta: { connectionName } };
}

export function useStatus(connectionName: string | null) {
  return useQuery({
    queryKey: recycleBinKeys.status(connectionName ?? ""),
    queryFn: () => apiGet<StatusResponse>("/api/recycle-bin/status", connection(connectionName ?? "")),
    enabled: !!connectionName,
  });
}

export function useTables(connectionName: string | null) {
  return useQuery({
    queryKey: recycleBinKeys.tables(connectionName ?? ""),
    queryFn: () => apiGet<TablesResponse>("/api/recycle-bin/tables", connection(connectionName ?? "")),
    enabled: !!connectionName,
  });
}

export function useUsers(connectionName: string | null) {
  return useQuery({
    queryKey: recycleBinKeys.users(connectionName ?? ""),
    queryFn: () => apiGet<UsersResponse>("/api/recycle-bin/users", connection(connectionName ?? "")),
    enabled: !!connectionName,
  });
}

interface PageParam {
  page: number;
  pagingCookie: string | null;
}

export function deletedBody(search: AppliedSearch, param: PageParam): DeletedBody {
  const audit = search.source === "audit";
  return {
    source: search.source,
    table: search.table,
    fromUtc: audit ? dayStartUtc(search.from) : null,
    toUtc: audit ? dayEndUtc(search.to) : null,
    deletedByUserId: audit && search.deletedBy ? search.deletedBy : null,
    pageSize: PAGE_SIZE,
    pagingCookie: param.pagingCookie,
    page: param.page,
  };
}

/** One search, a page at a time. A new search id starts from the first page. */
export function useDeletedRecords(connectionName: string | null, search: AppliedSearch | null) {
  return useInfiniteQuery({
    queryKey: recycleBinKeys.deleted(connectionName ?? "", search?.id ?? 0),
    queryFn: ({ pageParam }) =>
      apiPost<DeletedResponse>(
        "/api/recycle-bin/deleted",
        deletedBody(search!, pageParam),
        connection(connectionName ?? ""),
      ),
    initialPageParam: { page: 1, pagingCookie: null } as PageParam,
    getNextPageParam: (last): PageParam | undefined =>
      last.moreRecords ? { page: last.page + 1, pagingCookie: last.pagingCookie } : undefined,
    enabled: !!connectionName && search !== null,
    staleTime: Infinity,
    gcTime: 0,
  });
}

export function useRecordValues(connectionName: string | null, source: Source | null, record: DeletedRecord | null) {
  return useQuery({
    queryKey: recycleBinKeys.record(connectionName ?? "", source ?? "", record?.table ?? "", record?.key ?? ""),
    queryFn: () => {
      const params = new URLSearchParams({ source: source! });
      if (record!.auditId) params.set("auditId", record!.auditId);
      return apiGet<RecordResponse>(
        `/api/recycle-bin/records/${encodeURIComponent(record!.table)}/${encodeURIComponent(record!.recordId)}?${params.toString()}`,
        connection(connectionName ?? ""),
      );
    },
    enabled: !!connectionName && !!source && !!record && record.hasValues,
  });
}

export function useAttributes(connectionName: string | null, table: string | null) {
  return useQuery({
    queryKey: recycleBinKeys.attributes(connectionName ?? "", table ?? ""),
    queryFn: () =>
      apiGet<AttributeInfo[]>(
        `/api/metadata/entities/${encodeURIComponent(table!)}/attributes`,
        connection(connectionName ?? ""),
      ),
    enabled: !!connectionName && !!table,
    staleTime: METADATA_STALE_MS,
  });
}

/** Which of these records (at most 100) are still in the recycle bin. */
export function checkBin(connectionName: string, table: string, recordIds: string[]) {
  return apiPost<BinCheckResponse>("/api/recycle-bin/bin-check", { table, recordIds }, connection(connectionName));
}

/** Restores one chunk of records. Never replayed: a replay could restore twice. */
export function restoreRecords(connectionName: string, source: Source, items: RestoreItem[]) {
  return apiPost<RestoreResponse>(
    "/api/recycle-bin/restore",
    { source, items },
    { meta: { connectionName, noAuthRetry: true } },
  );
}
