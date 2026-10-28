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
  entityLogicalName: string;
  fetchXmlFilter?: string;
}

export interface TargetCountArgs extends RecordCountArgs {
  targetConnectionId: string;
}

export interface TargetCount {
  /** Source records matching the filter. */
  count: number;
  /** How many of them already exist in the target. */
  existing: number;
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
    queryFn: () => {
      const { connectionId, ...body } = args!;
      return apiPost<{ count: number }>("/api/migration/count", body, {
        meta: { connectionId },
      });
    },
    enabled: !!args,
  });
}

/** How many of all the records the migration will send already exist in the target. */
export function useTargetCount(args: TargetCountArgs | null) {
  return useQuery({
    queryKey: ["migration", "count", "target", args],
    queryFn: () => {
      const { connectionId, targetConnectionId, ...body } = args!;
      return apiPost<TargetCount>("/api/migration/count/target", body, {
        meta: { connectionId, targetConnectionId },
      });
    },
    enabled: !!args,
  });
}
