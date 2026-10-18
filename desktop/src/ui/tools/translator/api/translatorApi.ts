import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../../shared/api/client";
import { GLOBAL_SCOPE, tabDefinition, type ComponentTab } from "../model/labels";
import type {
  ApplyJob,
  ApplyRequest,
  ApplyStarted,
  LabelQueryRequest,
  LabelQueryResponse,
  LanguagesResponse,
  PublishResponse,
  PublishTargets,
  PublishersResponse,
  SolutionsResponse,
  TablesResponse,
} from "../model/types";
import { translatorKeys } from "./queryKeys";

/**
 * Reads give up after this long so a stalled sidecar or Dataverse call ends in an error with Retry,
 * not an endless spinner. Label queries for views and charts read every record's labels, so they get longer.
 */
export const READ_TIMEOUT_MS = 120_000;
export const LABELS_TIMEOUT_MS = 300_000;

function read(connectionId: string, signal?: AbortSignal, timeout = READ_TIMEOUT_MS) {
  return { meta: { connectionId }, signal, timeout };
}

/**
 * Metadata is cached for the tab session. Only Reload refetches.
 * No automatic retry: a throttled or missing component should surface at once.
 * The query's AbortSignal is passed on, so Reload, a connection change, or closing the tab
 * cancels the HTTP request (and the sidecar's Dataverse call) instead of leaving it running.
 */
export function useLanguages(connectionId: string | null) {
  return useQuery({
    queryKey: translatorKeys.languages(connectionId ?? ""),
    queryFn: ({ signal }) => apiGet<LanguagesResponse>("/api/translator/languages", read(connectionId ?? "", signal)),
    enabled: !!connectionId,
    staleTime: Infinity,
    retry: false,
  });
}

/** Tables for the scope list. With a solution id, only tables that have components in that solution. */
export function useTables(connectionId: string | null, solutionId: string | null) {
  return useQuery({
    queryKey: translatorKeys.tables(connectionId ?? "", solutionId ?? ""),
    queryFn: ({ signal }) =>
      apiGet<TablesResponse>("/api/translator/tables", {
        ...read(connectionId ?? "", signal),
        params: solutionId ? { solutionId } : undefined,
      }),
    enabled: !!connectionId,
    staleTime: Infinity,
    retry: false,
  });
}

export function useSolutions(connectionId: string | null) {
  return useQuery({
    queryKey: translatorKeys.solutions(connectionId ?? ""),
    queryFn: ({ signal }) => apiGet<SolutionsResponse>("/api/translator/solutions", read(connectionId ?? "", signal)),
    enabled: !!connectionId,
    staleTime: Infinity,
    retry: false,
  });
}

/** Loaded only when the user chooses to create a new solution. */
export function usePublishers(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: translatorKeys.publishers(connectionId ?? ""),
    queryFn: ({ signal }) => apiGet<PublishersResponse>("/api/translator/publishers", read(connectionId ?? "", signal)),
    enabled: !!connectionId && enabled,
    staleTime: Infinity,
    retry: false,
  });
}

export function fetchLabels(
  connectionId: string,
  solutionId: string | null,
  scope: string,
  tab: ComponentTab,
  lcids: readonly number[],
  signal?: AbortSignal,
) {
  const body: LabelQueryRequest = {
    tables: scope === GLOBAL_SCOPE ? [] : [scope],
    kinds: [tabDefinition(tab).kind],
    lcids: [...lcids],
    properties: "both",
    ...(solutionId ? { solutionId } : {}),
  };
  return apiPost<LabelQueryResponse>(
    "/api/translator/labels/query",
    body,
    read(connectionId, signal, LABELS_TIMEOUT_MS),
  );
}

export function useLabels(
  connectionId: string | null,
  solutionId: string | null,
  scope: string | null,
  tab: ComponentTab,
  lcids: readonly number[],
) {
  return useQuery({
    queryKey: translatorKeys.labels(connectionId ?? "", solutionId ?? "", scope ?? "", tab, lcids),
    queryFn: ({ signal }) => fetchLabels(connectionId ?? "", solutionId, scope ?? "", tab, lcids, signal),
    enabled: !!connectionId && !!scope && lcids.length > 0,
    staleTime: Infinity,
    retry: false,
  });
}

export function startApply(connectionId: string, body: ApplyRequest) {
  return apiPost<ApplyStarted>("/api/translator/labels/apply", body, {
    meta: { connectionId, noAuthRetry: true },
    timeout: READ_TIMEOUT_MS,
  });
}

export function fetchApplyJob(connectionId: string, jobId: string) {
  return apiGet<ApplyJob>(`/api/translator/jobs/${encodeURIComponent(jobId)}`, read(connectionId));
}

export function publishAgain(connectionId: string, targets: PublishTargets) {
  return apiPost<PublishResponse>("/api/translator/publish", targets, read(connectionId));
}
