import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../../../shared/api/client";
import type { MutationResultDto, StepDraftDto } from "../model/contracts";
import { registrationKeys } from "./queryKeys";

export function useStepMutations(connectionName: string | null) {
  const queryClient = useQueryClient();
  const meta = {
    connectionName: connectionName ?? undefined,
    noAuthRetry: true as const,
  };
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: registrationKeys.catalog(connectionName ?? ""),
    });

  const create = useMutation({
    mutationFn: (draft: StepDraftDto) =>
      apiPost<MutationResultDto>("/api/plugin-registration/steps", draft, { meta }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: StepDraftDto }) =>
      apiPost<MutationResultDto>(`/api/plugin-registration/steps/${id}/update`, draft, {
        meta,
      }),
    onSuccess: invalidate,
  });
  const enable = useMutation({
    mutationFn: (id: string) =>
      apiPost<MutationResultDto>(`/api/plugin-registration/steps/${id}/enable`, undefined, {
        meta,
      }),
    onSuccess: invalidate,
  });
  const disable = useMutation({
    mutationFn: (id: string) =>
      apiPost<MutationResultDto>(`/api/plugin-registration/steps/${id}/disable`, undefined, {
        meta,
      }),
    onSuccess: invalidate,
  });

  return { create, update, enable, disable };
}
