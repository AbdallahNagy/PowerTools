import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiPost } from "../../../shared/api/client";
import type { PluginHandler } from "../model/contracts";

export interface WorkflowActivityDraft {
  workflowActivityId: string;
  name: string;
  friendlyName: string | null;
  workflowActivityGroupName: string | null;
  description: string | null;
  expectedVersions: Record<string, number>;
}

export interface WorkflowActivityPreflight {
  draft: WorkflowActivityDraft;
  before: PluginHandler;
  after: PluginHandler;
  plan: { token: string; blockers: { code: string; message: string }[]; warnings: { code: string; message: string }[]; changes: { field: string; before: string | null; after: string | null }[]; confirmation: { message: string } };
}

export function useWorkflowActivityMutations(connectionName: string | null, refreshCatalog: () => Promise<unknown>) {
  const client = useQueryClient();
  const meta = { connectionName: connectionName ?? undefined };
  const route = (id: string, action: "preflight" | "execute") => `/api/plugin-registration/workflow-activities/${id}/update/${action}`;
  const preflight = useMutation({ mutationFn: (draft: WorkflowActivityDraft) =>
    apiPost<WorkflowActivityPreflight>(route(draft.workflowActivityId, "preflight"), draft, { meta }), retry: false });
  const execute = useMutation({ mutationFn: ({ draft, token }: { draft: WorkflowActivityDraft; token: string }) =>
    apiPost<{ outcome: string; succeededAndVerified: boolean; workflowActivity: PluginHandler | null }>(route(draft.workflowActivityId, "execute"), { draft, planToken: token }, { meta }), retry: false,
  onSuccess: async result => { if (!result.succeededAndVerified || !connectionName) return;
    await client.invalidateQueries({ queryKey: ["plugin-registration", "catalog", connectionName] });
    await refreshCatalog();
  } });
  return { preflight, execute };
}
