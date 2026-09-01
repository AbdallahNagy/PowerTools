import { useMutation, useQuery } from "@tanstack/react-query";

import { apiGet, apiPost } from "../../../shared/api/client";
import type { PluginStep } from "../model/contracts";

export type StepOperation = "create" | "update" | "enable" | "disable" | "unregister";
export interface StepDraft {
  pluginTypeId: string; sdkMessageId: string; sdkMessageFilterId: string;
  primaryTable: string; secondaryTable: string | null; stage: number; mode: number; rank: number;
  filteringAttributes: string[]; impersonatingUserId: string | null;
  unsecureConfiguration: string | null; replacementSecureConfiguration: string | null;
  expectedVersions: Record<string, number>;
  impersonatingUserAction: "keep" | "set" | "clear";
  unsecureConfigurationAction: "keep" | "set" | "clear";
}
export interface StepOptions {
  messages: { id: string; name: string }[];
  filters: { id: string; messageId: string; primaryTable: string; secondaryTable: string | null; primaryIdAttribute: string; availableAttributes: string[] }[];
  enabledUsers: { id: string; name: string }[];
}
export interface StepEditDetails extends StepDraft { stepId: string; secureConfigExists: boolean; }
export interface StepPublicValues {
  name: string; message: string; primaryTable: string; secondaryTable: string | null;
  stage: number; mode: number; rank: number; filteringAttributes: string[];
  impersonatingUserId: string | null; unsecureConfiguration: string | null;
  secureConfigExists: boolean; isEnabled: boolean; secureConfigurationAction: "keep" | "set";
}
export interface StepPreflight {
  draft: StepDraft;
  plan: { token: string; blockers: { code: string; message: string }[]; warnings: { code: string; message: string }[]; changes: { field: string; before: string | null; after: string | null }[]; confirmation: { message: string; requiredText?: string | null } };
  before: StepPublicValues | null;
  after: StepPublicValues;
}

function route(operation: StepOperation, stepId: string | null, action: "preflight" | "execute") {
  return operation === "create"
    ? `/api/plugin-registration/steps/create/${action}`
    : `/api/plugin-registration/steps/${stepId}/${operation}/${action}`;
}

export function useStepMutations(connectionName: string | null) {
  const meta = { connectionName: connectionName ?? undefined };
  const options = useQuery({
    queryKey: ["plugin-registration", "step-options", connectionName],
    queryFn: () => apiGet<StepOptions>("/api/plugin-registration/step-options", { meta }),
    enabled: Boolean(connectionName), staleTime: 0,
  });
  const preflight = useMutation({
    mutationFn: ({ operation, stepId, draft }: { operation: StepOperation; stepId: string | null; draft: StepDraft }) =>
      apiPost<StepPreflight>(route(operation, stepId, "preflight"), draft, { meta, noAuthRetry: true }), retry: false,
  });
  const execute = useMutation({
    mutationFn: ({ operation, stepId, draft, token, typedName }: { operation: StepOperation; stepId: string | null; draft: StepDraft; token: string; typedName?: string }) =>
      apiPost<{ outcome: string; succeededAndVerified: boolean; step: PluginStep | null }>(
        route(operation, stepId, "execute"), { draft, planToken: token, typedName: typedName ?? null }, { meta, noAuthRetry: true }),
    retry: false,
  });
  return { options, preflight, execute };
}

export function useStepEditDetails(connectionName: string | null, stepId: string | null) {
  const meta = { connectionName: connectionName ?? undefined };
  return useQuery({ queryKey: ["plugin-registration", "step-edit-details", connectionName, stepId],
    queryFn: () => apiGet<StepEditDetails>(`/api/plugin-registration/steps/${stepId}/edit-details`, { meta }),
    enabled: Boolean(connectionName && stepId), staleTime: 0 });
}
