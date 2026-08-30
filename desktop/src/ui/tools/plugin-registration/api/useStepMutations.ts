import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost } from "../../../shared/api/client";
import type { PluginStep } from "../model/contracts";

export type StepOperation = "create" | "update" | "enable" | "disable" | "unregister";
export interface StepDraft {
  pluginTypeId: string; sdkMessageId: string; sdkMessageFilterId: string;
  primaryTable: string; secondaryTable: string | null; stage: number; mode: number; rank: number;
  filteringAttributes: string[]; impersonatingUserId: string | null;
  unsecureConfiguration: string | null; replacementSecureConfiguration: string | null;
  expectedVersions: Record<string, number>;
}
export interface StepOptions {
  messages: { id: string; name: string }[];
  filters: { id: string; messageId: string; primaryTable: string; secondaryTable: string | null; primaryIdAttribute: string }[];
  enabledUsers: { id: string; name: string }[];
}
export interface StepPreflight {
  draft: StepDraft;
  plan: { token: string; blockers: { code: string; message: string }[]; warnings: { code: string; message: string }[]; confirmation: { message: string; requiredText?: string | null } };
  after: { message: string; primaryTable: string; secondaryTable: string | null; stage: number; mode: number; rank: number; filteringAttributes: string[]; secureConfigExists: boolean };
}

function route(operation: StepOperation, stepId: string | null, action: "preflight" | "execute") {
  return operation === "create"
    ? `/api/plugin-registration/steps/create/${action}`
    : `/api/plugin-registration/steps/${stepId}/${operation}/${action}`;
}

export function useStepMutations(connectionName: string | null, refreshCatalog: () => Promise<unknown>) {
  const queryClient = useQueryClient();
  const meta = { connectionName: connectionName ?? undefined };
  const options = useQuery({
    queryKey: ["plugin-registration", "step-options", connectionName],
    queryFn: () => apiGet<StepOptions>("/api/plugin-registration/step-options", { meta }),
    enabled: Boolean(connectionName), staleTime: 0,
  });
  const preflight = useMutation({
    mutationFn: ({ operation, stepId, draft }: { operation: StepOperation; stepId: string | null; draft: StepDraft }) =>
      apiPost<StepPreflight>(route(operation, stepId, "preflight"), draft, { meta }), retry: false,
  });
  const execute = useMutation({
    mutationFn: ({ operation, stepId, draft, token, typedName }: { operation: StepOperation; stepId: string | null; draft: StepDraft; token: string; typedName?: string }) =>
      apiPost<{ outcome: string; succeededAndVerified: boolean; step: PluginStep | null }>(
        route(operation, stepId, "execute"), { draft, planToken: token, typedName: typedName ?? null }, { meta }),
    retry: false,
    onSuccess: async (result) => {
      if (!result.succeededAndVerified || !connectionName) return;
      await queryClient.invalidateQueries({ queryKey: ["plugin-registration", "catalog", connectionName] });
      await refreshCatalog();
    },
  });
  return { options, preflight, execute };
}
