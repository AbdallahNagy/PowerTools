import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../../../shared/api/client";

export type CascadeTargetKind = "assembly" | "plugin" | "workflowActivity";
export interface CascadeDraft { targetKind: CascadeTargetKind; targetId: string; expectedVersions: Record<string, number>; }
export interface CascadePreflight { draft: CascadeDraft; plan: { token: string; blockers: { code: string; message: string }[] }; impact: {
  assembly: { name: string } | null; handlers: { typeName: string; kind: CascadeTargetKind }[]; steps: { name: string; isEnabled: boolean }[]; images: { name: string }[];
  externalDependencies: { componentTypeLabel: string; name: string }[]; enabledStepCount: number; }; }

export function useUnregisterMutations(connectionName: string | null, refreshCatalog: () => Promise<unknown>) {
  const client = useQueryClient();
  const meta = { connectionName: connectionName ?? undefined };
  const preflight = useMutation({ mutationFn: (draft: CascadeDraft) => apiPost<CascadePreflight>("/api/plugin-registration/cascade-unregister/preflight", draft, { meta }), retry: false });
  const execute = useMutation({ mutationFn: ({ draft, token, typedName, acknowledged }: { draft: CascadeDraft; token: string; typedName: string; acknowledged: boolean }) =>
    apiPost<{ outcome: string; succeededAndVerified: boolean }>("/api/plugin-registration/cascade-unregister/execute", { draft, planToken: token, typedName, acknowledged }, { meta }), retry: false,
  onSuccess: async result => { if (!result.succeededAndVerified || !connectionName) return; await client.invalidateQueries({ queryKey: ["plugin-registration", "catalog", connectionName] }); await refreshCatalog(); } });
  return { preflight, execute };
}
