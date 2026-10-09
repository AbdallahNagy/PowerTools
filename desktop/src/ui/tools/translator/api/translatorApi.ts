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

function read(connectionName: string, signal?: AbortSignal, timeout = READ_TIMEOUT_MS) {
  return { meta: { connectionName }, signal, timeout };
}

/**
 * Metadata is cached for the tab session. Only Reload refetches.
 * No automatic retry: a throttled or missing component should surface at once.
 * The query's AbortSignal is passed on, so Reload, a connection change, or closing the tab
 * cancels the HTTP request (and the sidecar's Dataverse call) instead of leaving it running.
 */
export function useLanguages(connectionName: string | null) {
  return useQuery({
    queryKey: translatorKeys.languages(connectionName ?? ""),
    queryFn: ({ signal }) => apiGet<LanguagesResponse>("/api/translator/languages", read(connectionName ?? "", signal)),
    enabled: !!connectionName,
    staleTime: Infinity,
    retry: false,
  });
}

/** Tables for the scope list. With a solution id, only tables that have components in that solution. */
export function useTables(connectionName: string | null, solutionId: string | null) {
  return useQuery({
    queryKey: translatorKeys.tables(connectionName ?? "", solutionId ?? ""),
    queryFn: ({ signal }) =>
      apiGet<TablesResponse>("/api/translator/tables", {
        ...read(connectionName ?? "", signal),
        params: solutionId ? { solutionId } : undefined,
      }),
    enabled: !!connectionName,
    staleTime: Infinity,
    retry: false,
  });
}

export function useSolutions(connectionName: string | null) {
  return useQuery({
    queryKey: translatorKeys.solutions(connectionName ?? ""),
    queryFn: ({ signal }) => apiGet<SolutionsResponse>("/api/translator/solutions", read(connectionName ?? "", signal)),
    enabled: !!connectionName,
    staleTime: Infinity,
    retry: false,
  });
}

/** Loaded only when the user chooses to create a new solution. */
export function usePublishers(connectionName: string | null, enabled: boolean) {
  return useQuery({
    queryKey: translatorKeys.publishers(connectionName ?? ""),
    queryFn: ({ signal }) => apiGet<PublishersResponse>("/api/translator/publishers", read(connectionName ?? "", signal)),
    enabled: !!connectionName && enabled,
    staleTime: Infinity,
    retry: false,
  });
}

export function fetchLabels(
  connectionName: string,
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
    read(connectionName, signal, LABELS_TIMEOUT_MS),
  );
}

export function useLabels(
  connectionName: string | null,
  solutionId: string | null,
  scope: string | null,
  tab: ComponentTab,
  lcids: readonly number[],
) {
  return useQuery({
    queryKey: translatorKeys.labels(connectionName ?? "", solutionId ?? "", scope ?? "", tab, lcids),
    queryFn: ({ signal }) => fetchLabels(connectionName ?? "", solutionId, scope ?? "", tab, lcids, signal),
    enabled: !!connectionName && !!scope && lcids.length > 0,
    staleTime: Infinity,
    retry: false,
  });
}

export function startApply(connectionName: string, body: ApplyRequest) {
  return apiPost<ApplyStarted>("/api/translator/labels/apply", body, {
    meta: { connectionName, noAuthRetry: true },
    timeout: READ_TIMEOUT_MS,
  });
}

export function fetchApplyJob(connectionName: string, jobId: string) {
  return apiGet<ApplyJob>(`/api/translator/jobs/${encodeURIComponent(jobId)}`, read(connectionName));
}

export function publishAgain(connectionName: string, targets: PublishTargets) {
  return apiPost<PublishResponse>("/api/translator/publish", targets, read(connectionName));
}
