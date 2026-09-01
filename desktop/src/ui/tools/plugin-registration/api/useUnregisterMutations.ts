import { useMutation } from "@tanstack/react-query";
import { apiPost } from "../../../shared/api/client";

export type CascadeTargetKind = "assembly" | "plugin" | "workflowActivity";
export interface CascadeDraft { targetKind: CascadeTargetKind; targetId: string; expectedVersions: Record<string, number>; }
export interface CascadePreflight { draft: CascadeDraft; plan: { token: string; blockers: { code: string; message: string }[] }; impact: {
  assembly: { name: string } | null; handlers: { typeName: string; kind: CascadeTargetKind }[]; steps: { name: string; isEnabled: boolean }[]; images: { name: string }[];
  externalDependencies: { componentTypeLabel: string; name: string }[]; enabledStepCount: number; }; }

export function useUnregisterMutations(connectionName: string | null) {
  const meta = { connectionName: connectionName ?? undefined };
  const preflight = useMutation({ mutationFn: (draft: CascadeDraft) => apiPost<CascadePreflight>("/api/plugin-registration/cascade-unregister/preflight", draft, { meta, noAuthRetry: true }), retry: false });
  const execute = useMutation({ mutationFn: ({ draft, token, typedName, acknowledged }: { draft: CascadeDraft; token: string; typedName: string; acknowledged: boolean }) =>
    apiPost<{ outcome: string; targetId?: string | null; succeededAndVerified: boolean; problem?: unknown }>("/api/plugin-registration/cascade-unregister/execute", { draft, planToken: token, typedName, acknowledged }, { meta, noAuthRetry: true }), retry: false });
  return { preflight, execute };
}
