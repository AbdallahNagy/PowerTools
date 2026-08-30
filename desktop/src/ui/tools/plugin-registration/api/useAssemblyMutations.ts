import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiPost } from "../../../shared/api/client";
import type { PluginAssembly } from "../model/contracts";

export interface AssemblyInspection {
  fileName: string;
  size: number;
  sha256: string;
  identity: { name: string; version: string; culture: string; publicKeyToken: string };
  plugins: { typeName: string }[];
  workflowActivities: { typeName: string; arguments: unknown[] }[];
}

export interface AssemblyMutationDraft {
  fileName: string;
  operation: "register" | "update";
  assemblyId: string | null;
  requestedIsolationMode: number;
  requestedSourceType: number;
  expectedAssemblyVersionNumber: number | null;
  expectedHandlerVersionNumbers: Record<string, number>;
  inspection: AssemblyInspection;
}

export interface AssemblyMutationPreflight {
  draft: AssemblyMutationDraft;
  plan: { token: string; blockers: { code: string; message: string }[]; warnings: { code: string; message: string }[]; confirmation: { level: string; message: string; requiredText?: string | null; requiresAcknowledgement: boolean } };
  impact: {
    previousIdentity: AssemblyInspection["identity"] | null; currentIdentity: AssemblyInspection["identity"];
    previousSha256: string | null; currentSha256: string; previousSize: number | null; currentSize: number;
    previousIsolationMode: number | null; currentIsolationMode: number; previousSourceType: number | null; currentSourceType: number;
    addedPlugins: string[]; unchangedPlugins: string[]; changedPlugins: string[]; removedPlugins: string[];
    addedWorkflowActivities: string[]; changedWorkflowActivities: string[]; removedWorkflowActivities: string[];
    ownedStepsAndImages: string[]; dependencies: string[];
    workflowContractDifferences: { typeName: string; argumentName: string; change: string; isBreaking: boolean; isReferenced: boolean }[];
    warnings: { code: string; message: string }[]; blockers: { code: string; message: string }[];
  };
}

interface AssemblyMutationResult {
  outcome: string;
  succeededAndVerified: boolean;
  assembly: PluginAssembly | null;
}

function formData(file: File, draft: AssemblyMutationDraft, planToken?: string) {
  const form = new FormData();
  form.append("assembly", file);
  form.append("draft", JSON.stringify(draft));
  if (planToken) form.append("planToken", planToken);
  return form;
}

export function useAssemblyMutations(
  connectionName: string | null,
  refreshCatalog: () => Promise<unknown>,
  onVerified: (assembly: PluginAssembly) => void,
) {
  const queryClient = useQueryClient();
  const meta = { connectionName: connectionName ?? undefined };
  const analyze = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("assembly", file);
      return apiPost<AssemblyInspection>("/api/plugin-registration/assemblies/analyze", form, { meta });
    },
    retry: false,
  });
  const preflight = useMutation({
    mutationFn: ({ file, draft }: { file: File; draft: AssemblyMutationDraft }) =>
      apiPost<AssemblyMutationPreflight>(
        draft.operation === "register"
          ? "/api/plugin-registration/assemblies/register/preflight"
          : `/api/plugin-registration/assemblies/${draft.assemblyId}/update/preflight`,
        formData(file, draft), { meta },
      ),
    retry: false,
  });
  const execute = useMutation({
    mutationFn: ({ file, draft, token }: { file: File; draft: AssemblyMutationDraft; token: string }) =>
      apiPost<AssemblyMutationResult>(
        draft.operation === "register"
          ? "/api/plugin-registration/assemblies/register/execute"
          : `/api/plugin-registration/assemblies/${draft.assemblyId}/update/execute`,
        formData(file, draft, token), { meta },
      ),
    retry: false,
    onSuccess: async (result) => {
      if (!result.succeededAndVerified || !result.assembly || !connectionName) return;
      onVerified(result.assembly);
      await queryClient.invalidateQueries({ queryKey: ["plugin-registration", "catalog", connectionName] });
      await refreshCatalog();
    },
  });
  return { analyze, preflight, execute };
}
