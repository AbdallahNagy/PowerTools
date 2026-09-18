import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../../../shared/api/client";
import type { ImageDraftDto, MutationResultDto } from "../model/contracts";
import { registrationKeys } from "./queryKeys";

export function useImageMutations(connectionName: string | null) {
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
    mutationFn: (draft: ImageDraftDto) =>
      apiPost<MutationResultDto>("/api/plugin-registration/images", draft, { meta }),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: ImageDraftDto }) =>
      apiPost<MutationResultDto>(`/api/plugin-registration/images/${id}/update`, draft, {
        meta,
      }),
    onSuccess: invalidate,
  });

  return { create, update };
}
