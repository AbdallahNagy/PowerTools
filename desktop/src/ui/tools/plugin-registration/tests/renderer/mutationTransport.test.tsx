import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../../../../test/support/render";
import { useAssemblyMutations, type AssemblyMutationDraft } from "../../api/useAssemblyMutations";
import { useImageMutations } from "../../api/useImageMutations";
import { useStepMutations } from "../../api/useStepMutations";
import { useUnregisterMutations } from "../../api/useUnregisterMutations";
import { useWorkflowActivityMutations } from "../../api/useWorkflowActivityMutations";

const apiPost = vi.hoisted(() => vi.fn());
vi.mock("../../../../shared/api/client", async (original) => ({
  ...await original<typeof import("../../../../shared/api/client")>(),
  apiGet: vi.fn().mockResolvedValue({ messages: [], filters: [], enabledUsers: [] }),
  apiPost,
}));

beforeEach(() => apiPost.mockReset().mockResolvedValue({ succeededAndVerified: false }));

it("marks every plug-in registration POST as a single-attempt request", async () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
  );
  const assemblyHook = renderHook(() => useAssemblyMutations("Development"), { wrapper });
  const stepHook = renderHook(() => useStepMutations("Development"), { wrapper });
  const imageHook = renderHook(() => useImageMutations("Development"), { wrapper });
  const workflowHook = renderHook(() => useWorkflowActivityMutations("Development"), { wrapper });
  const cascadeHook = renderHook(() => useUnregisterMutations("Development"), { wrapper });

  const file = new File(["dll"], "Contoso.dll");
  const inspection = { fileName: file.name, size: 3, sha256: "abc", identity: { name: "Contoso", version: "1", culture: "neutral", publicKeyToken: "token" }, plugins: [], workflowActivities: [] };
  const assemblyDraft: AssemblyMutationDraft = { fileName: file.name, operation: "register", assemblyId: null,
    requestedIsolationMode: 2, requestedSourceType: 0, expectedAssemblyVersionNumber: null,
    expectedHandlerVersionNumbers: {}, inspection };
  const stepDraft = { pluginTypeId: "plugin", sdkMessageId: "message", sdkMessageFilterId: "filter",
    primaryTable: "account", secondaryTable: null, stage: 40, mode: 0, rank: 1,
    filteringAttributes: ["name"], impersonatingUserId: null, unsecureConfiguration: null,
    replacementSecureConfiguration: null, expectedVersions: { plugin: 1 },
    impersonatingUserAction: "keep" as const, unsecureConfigurationAction: "keep" as const };
  const imageDraft = { stepId: "step", imageType: 0, alias: "PreImage", messagePropertyName: "Target",
    attributes: ["name"], expectedVersions: { step: 1 } };
  const workflowDraft = { workflowActivityId: "workflow", name: "Activity", friendlyName: null,
    workflowActivityGroupName: null, description: null, expectedVersions: { workflow: 1 } };
  const cascadeDraft = { targetKind: "plugin" as const, targetId: "plugin", expectedVersions: { plugin: 1 } };

  await assemblyHook.result.current.analyze.mutateAsync(file);
  await assemblyHook.result.current.preflight.mutateAsync({ file, draft: assemblyDraft });
  await assemblyHook.result.current.execute.mutateAsync({ file, draft: assemblyDraft, token: "token" });
  await stepHook.result.current.preflight.mutateAsync({ operation: "create", stepId: null, draft: stepDraft });
  await stepHook.result.current.execute.mutateAsync({ operation: "create", stepId: null, draft: stepDraft, token: "token" });
  await imageHook.result.current.preflight.mutateAsync({ operation: "create", imageId: null, draft: imageDraft });
  await imageHook.result.current.execute.mutateAsync({ operation: "create", imageId: null, draft: imageDraft, token: "token" });
  await workflowHook.result.current.preflight.mutateAsync(workflowDraft);
  await workflowHook.result.current.execute.mutateAsync({ draft: workflowDraft, token: "token" });
  await cascadeHook.result.current.preflight.mutateAsync(cascadeDraft);
  await cascadeHook.result.current.execute.mutateAsync({ draft: cascadeDraft, token: "token", typedName: "Contoso.Plugin", acknowledged: false });

  expect(apiPost).toHaveBeenCalledTimes(11);
  for (const call of apiPost.mock.calls) {
    expect(call[2]).toMatchObject({ noAuthRetry: true });
  }
});
