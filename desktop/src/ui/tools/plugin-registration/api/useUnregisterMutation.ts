import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../../../shared/api/client";
import type { MutationResultDto } from "../model/contracts";
import { registrationKeys } from "./queryKeys";

export type UnregisterKind = "assembly" | "type" | "step" | "image";

const pathByKind: Record<UnregisterKind, string> = {
  assembly: "assemblies",
  type: "types",
  step: "steps",
  image: "images",
};

export function useUnregisterMutation(connectionName: string | null) {
  const queryClient = useQueryClient();
  const meta = {
    connectionName: connectionName ?? undefined,
    noAuthRetry: true as const,
  };

  return useMutation({
    mutationFn: ({ kind, id }: { kind: UnregisterKind; id: string }) =>
      apiPost<MutationResultDto>(
        `/api/plugin-registration/${pathByKind[kind]}/${id}/unregister`,
        undefined,
        { meta },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: registrationKeys.catalog(connectionName ?? ""),
      }),
  });
}
