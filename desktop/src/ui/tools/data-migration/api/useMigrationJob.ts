import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../../shared/api/client";

export interface MigrationJobStatus {
  status: "queued" | "running" | "completed" | "failed";
  processed: number;
  total: number;
  succeeded: number;
  /** Succeeded records that were new in the target. */
  created: number;
  /** Succeeded records that already existed in the target. */
  updated: number;
  /** Source records the options did not cover, such as existing records in create-only runs. */
  skipped: number;
  /** Target records removed because they are not in the source. */
  deleted: number;
  failed: number;
  errors: { recordId: string; message: string }[];
}

export interface RunMigrationArgs {
  entityLogicalName: string;
  attributes: string[];
  fetchXmlFilter?: string;
  /** Create source records missing from the target. */
  create: boolean;
  /** Update source records that already exist in the target. */
  update: boolean;
  /** Delete target records that are not among the source records matching the filter. */
  delete: boolean;
  /** Required with delete: the run deletes nothing if it finds more than this. */
  confirmedDeleteCount?: number;
  sourceConnectionId: string;
  targetConnectionId: string;
}

export function useStartMigration() {
  return useMutation({
    mutationFn: ({ sourceConnectionId, targetConnectionId, ...body }: RunMigrationArgs) =>
      apiPost<{ jobId: string }>("/api/migration/run", body, {
        meta: { connectionId: sourceConnectionId, targetConnectionId },
      }),
  });
}

export function useMigrationJob(jobId: string | null) {
  return useQuery({
    queryKey: ["migration", "job", jobId],
    queryFn: () => apiGet<MigrationJobStatus>(`/api/migration/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 1000 : false;
    },
  });
}
