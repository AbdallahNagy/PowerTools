import { useQuery } from "@tanstack/react-query";
import { apiPost } from "../../../shared/api/client";

export interface PreviewResult {
  records: Record<string, string | null>[];
  pagingCookie: string | null;
  moreRecords: boolean;
  totalEstimate: number | null;
}

export interface PreviewArgs {
  connectionId: string;
  entityLogicalName: string;
  attributes: string[];
  fetchXmlFilter?: string;
  pageSize?: number;
  pagingCookie?: string;
  page?: number;
}

export function usePreviewRecords(args: PreviewArgs | null) {
  return useQuery({
    queryKey: ["migration", "preview", args],
    queryFn: () => {
      const { connectionId, ...body } = args!;
      return apiPost<PreviewResult>("/api/migration/preview", body, {
        meta: { connectionId },
      });
    },
    enabled: !!args,
  });
}
