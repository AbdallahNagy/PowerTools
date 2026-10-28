import { useQuery } from "@tanstack/react-query";
import { apiPost } from "../../../shared/api/client";

export interface PreviewRecord {
  id: string;
  name: string | null;
  /** Null until a target is chosen. */
  existsInTarget: boolean | null;
}

export interface PreviewResult {
  records: PreviewRecord[];
  pagingCookie: string | null;
  moreRecords: boolean;
}

export interface PreviewArgs {
  connectionId: string;
  /** When set, each record is checked against this target. */
  targetConnectionId?: string;
  entityLogicalName: string;
  fetchXmlFilter?: string;
  pageSize?: number;
  pagingCookie?: string;
  page?: number;
}

export interface RecordCountArgs {
  connectionId: string;
  /** When set, also counts how many of the records already exist in this target. */
  targetConnectionId?: string;
  entityLogicalName: string;
  fetchXmlFilter?: string;
}

export interface RecordCount {
  count: number;
  /** Records that already exist in the target. Null without a target. */
  existing: number | null;
}

interface PreviewPage {
  records: { id: string; name: string | null }[];
  pagingCookie: string | null;
  moreRecords: boolean;
}

export function usePreviewRecords(args: PreviewArgs | null) {
  return useQuery({
    queryKey: ["migration", "preview", args],
    queryFn: async (): Promise<PreviewResult> => {
      const { connectionId, targetConnectionId, ...body } = args!;
      const page = await apiPost<PreviewPage>("/api/migration/preview", body, {
        meta: { connectionId },
      });
      if (!targetConnectionId || page.records.length === 0) {
        return {
          ...page,
          records: page.records.map((r) => ({ ...r, existsInTarget: null })),
        };
      }
      const { existingIds } = await apiPost<{ existingIds: string[] }>(
        "/api/migration/existing",
        { entityLogicalName: body.entityLogicalName, ids: page.records.map((r) => r.id) },
        { meta: { connectionId, targetConnectionId } },
      );
      const existing = new Set(existingIds.map((id) => id.toLowerCase()));
      return {
        ...page,
        records: page.records.map((r) => ({
          ...r,
          existsInTarget: existing.has(r.id.toLowerCase()),
        })),
      };
    },
    enabled: !!args,
  });
}

/** Number of source records the migration will send, across all pages. */
export function useRecordCount(args: RecordCountArgs | null) {
  return useQuery({
    queryKey: ["migration", "count", args],
    queryFn: async (): Promise<RecordCount> => {
      const { connectionId, targetConnectionId, ...body } = args!;
      if (targetConnectionId) {
        return apiPost<RecordCount>("/api/migration/count/target", body, {
          meta: { connectionId, targetConnectionId },
        });
      }
      const { count } = await apiPost<{ count: number }>("/api/migration/count", body, {
        meta: { connectionId },
      });
      return { count, existing: null };
    },
    enabled: !!args,
  });
}

export interface DeletionArgs {
  connectionId: string;
  targetConnectionId: string;
  entityLogicalName: string;
  fetchXmlFilter?: string;
}

export interface Deletions {
  /** Target records the delete option removes, across all pages. */
  count: number;
  /** Source records matching the filter. */
  sourceCount: number;
  /** The first records to delete, for review. */
  records: { id: string; name: string | null }[];
}

/**
 * Target records that match the filter but are not in the source: what the
 * delete option removes from that target.
 */
export function useDeletions(args: DeletionArgs | null) {
  return useQuery({
    queryKey: ["migration", "deletions", args],
    queryFn: () => {
      const { connectionId, targetConnectionId, ...body } = args!;
      return apiPost<Deletions>("/api/migration/deletions", body, {
        meta: { connectionId, targetConnectionId },
      });
    },
    enabled: !!args,
    // A delete is confirmed against this list, so never show a stale one.
    staleTime: 0,
    gcTime: 0,
  });
}
