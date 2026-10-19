import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../../shared/api/client";
import {
  APPLICATION_KEY,
  type BaseRibbon,
  type DiffsRequest,
  type LoadResponse,
  type PublishJob,
  type PublishRequest,
  type PublishStarted,
  type PublishTargets,
  type SolutionsResponse,
  type ValidateResponse,
} from "../model/types";

const BASE = "/api/ribbon-workbench";

export const ribbonKeys = {
  all: (connectionId: string) => ["ribbon-workbench", connectionId] as const,
  solutions: (connectionId: string) => ["ribbon-workbench", connectionId, "solutions"] as const,
  baseRibbon: (connectionId: string, key: string) => ["ribbon-workbench", connectionId, "base", key] as const,
};

export const READ_TIMEOUT_MS = 120_000;
/** Loading exports the solution, which can take minutes for a large one. */
export const LOAD_TIMEOUT_MS = 900_000;

function read(connectionId: string, signal?: AbortSignal, timeout = READ_TIMEOUT_MS) {
  return { meta: { connectionId }, signal, timeout };
}

export function useSolutions(connectionId: string | null) {
  return useQuery({
    queryKey: ribbonKeys.solutions(connectionId ?? ""),
    queryFn: ({ signal }) => apiGet<SolutionsResponse>(`${BASE}/solutions`, read(connectionId ?? "", signal)),
    enabled: !!connectionId,
    staleTime: Infinity,
    retry: false,
  });
}

export function loadSolution(connectionId: string, solutionUniqueName: string, signal?: AbortSignal) {
  return apiPost<LoadResponse>(`${BASE}/load`, { solutionUniqueName }, read(connectionId, signal, LOAD_TIMEOUT_MS));
}

/** The published ribbon of a table, or of the application when the key is applicationribbon. */
export function useBaseRibbon(connectionId: string | null, key: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ribbonKeys.baseRibbon(connectionId ?? "", key ?? ""),
    queryFn: ({ signal }) =>
      apiGet<BaseRibbon>(`${BASE}/base-ribbon`, {
        ...read(connectionId ?? "", signal),
        params: key && key !== APPLICATION_KEY ? { entity: key } : undefined,
      }),
    enabled: !!connectionId && !!key && enabled,
    staleTime: Infinity,
    retry: false,
  });
}

export function validateDiffs(connectionId: string, body: DiffsRequest) {
  return apiPost<ValidateResponse>(`${BASE}/validate`, body, read(connectionId, undefined, LOAD_TIMEOUT_MS));
}

export function startPublish(connectionId: string, body: PublishRequest) {
  return apiPost<PublishStarted>(`${BASE}/publish`, body, {
    meta: { connectionId, noAuthRetry: true },
    timeout: LOAD_TIMEOUT_MS,
  });
}

export function fetchPublishJob(connectionId: string, jobId: string) {
  return apiGet<PublishJob>(`${BASE}/jobs/${encodeURIComponent(jobId)}`, read(connectionId));
}

export function publishAgain(connectionId: string, targets: PublishTargets) {
  return apiPost<{ status: string }>(`${BASE}/publish-again`, targets, {
    meta: { connectionId, noAuthRetry: true },
    timeout: LOAD_TIMEOUT_MS,
  });
}
