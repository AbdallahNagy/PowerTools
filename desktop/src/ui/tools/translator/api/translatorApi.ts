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
  TableInfo,
} from "../model/types";
import { translatorKeys } from "./queryKeys";

function connection(connectionName: string) {
  return { meta: { connectionName } };
}

/**
 * Metadata is cached for the tab session. Only Reload refetches.
 * No automatic retry: a throttled or missing component should surface at once.
 */
export function useLanguages(connectionName: string | null) {
  return useQuery({
    queryKey: translatorKeys.languages(connectionName ?? ""),
    queryFn: () => apiGet<LanguagesResponse>("/api/translator/languages", connection(connectionName ?? "")),
    enabled: !!connectionName,
    staleTime: Infinity,
    retry: false,
  });
}

export function useTables(connectionName: string | null) {
  return useQuery({
    queryKey: translatorKeys.tables(connectionName ?? ""),
    queryFn: () => apiGet<TableInfo[]>("/api/metadata/entities", connection(connectionName ?? "")),
    enabled: !!connectionName,
    staleTime: Infinity,
    retry: false,
  });
}

export function fetchLabels(
  connectionName: string,
  scope: string,
  tab: ComponentTab,
  lcids: readonly number[],
) {
  const body: LabelQueryRequest = {
    tables: scope === GLOBAL_SCOPE ? [] : [scope],
    kinds: [tabDefinition(tab).kind],
    lcids: [...lcids],
    properties: "both",
  };
  return apiPost<LabelQueryResponse>("/api/translator/labels/query", body, connection(connectionName));
}

export function useLabels(
  connectionName: string | null,
  scope: string | null,
  tab: ComponentTab,
  lcids: readonly number[],
) {
  return useQuery({
    queryKey: translatorKeys.labels(connectionName ?? "", scope ?? "", tab, lcids),
    queryFn: () => fetchLabels(connectionName ?? "", scope ?? "", tab, lcids),
    enabled: !!connectionName && !!scope && lcids.length > 0,
    staleTime: Infinity,
    retry: false,
  });
}

export function startApply(connectionName: string, body: ApplyRequest) {
  return apiPost<ApplyStarted>("/api/translator/labels/apply", body, {
    meta: { connectionName, noAuthRetry: true },
  });
}

export function fetchApplyJob(connectionName: string, jobId: string) {
  return apiGet<ApplyJob>(`/api/translator/jobs/${encodeURIComponent(jobId)}`, connection(connectionName));
}

export function publishAgain(connectionName: string, targets: PublishTargets) {
  return apiPost<PublishResponse>("/api/translator/publish", targets, connection(connectionName));
}
