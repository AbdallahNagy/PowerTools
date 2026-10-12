import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../../shared/api/client";
import type { FolderInfo, GenerationJob, GenerationRequest, JobStarted, TableNamesResponse } from "../model/types";
import { earlyBoundGeneratorKeys } from "./queryKeys";

/** Reading every table name on a large environment can take a while. */
export const READ_TIMEOUT_MS = 120_000;

function read(connectionName: string, signal?: AbortSignal) {
  return { meta: { connectionName }, signal, timeout: READ_TIMEOUT_MS };
}

/**
 * Every table logical name, used to expand wildcards and check names before a run.
 * Loaded once per environment for the tab session.
 */
export function useTableNames(connectionName: string | null) {
  return useQuery({
    queryKey: earlyBoundGeneratorKeys.tables(connectionName ?? ""),
    queryFn: ({ signal }) =>
      apiGet<TableNamesResponse>("/api/early-bound-generator/tables", read(connectionName ?? "", signal)),
    enabled: !!connectionName,
    staleTime: Infinity,
    retry: false,
  });
}

/** Whether the output folder holds files, and the settings in its builderSettings.json. */
export function useFolderInfo(connectionName: string | null, path: string | null) {
  return useQuery({
    queryKey: earlyBoundGeneratorKeys.folder(connectionName ?? "", path ?? ""),
    queryFn: ({ signal }) =>
      apiGet<FolderInfo>("/api/early-bound-generator/folder", {
        ...read(connectionName ?? "", signal),
        params: { path },
      }),
    enabled: !!connectionName && !!path,
    staleTime: 0,
    retry: false,
  });
}

export function startGeneration(connectionName: string, body: GenerationRequest) {
  return apiPost<JobStarted>("/api/early-bound-generator/jobs", body, {
    meta: { connectionName, noAuthRetry: true },
    timeout: READ_TIMEOUT_MS,
  });
}

export function fetchGenerationJob(connectionName: string, jobId: string) {
  return apiGet<GenerationJob>(
    `/api/early-bound-generator/jobs/${encodeURIComponent(jobId)}`,
    read(connectionName),
  );
}
