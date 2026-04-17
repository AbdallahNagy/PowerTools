import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../client";

export interface MigrationJobStatus {
  status: "queued" | "running" | "completed" | "failed";
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
  errors: { recordId: string; message: string }[];
}

export interface RunMigrationArgs {
  entityLogicalName: string;
  attributes: string[];
  fetchXmlFilter?: string;
  mode: "create" | "update" | "upsert";
  matchAttribute?: string;
  targetConnectionName: string;
}

export function useStartMigration() {
  return useMutation({
    mutationFn: ({ targetConnectionName, ...body }: RunMigrationArgs) =>
      apiPost<{ jobId: string }>("/api/migration/run", body, {
        meta: { targetConnectionName },
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
