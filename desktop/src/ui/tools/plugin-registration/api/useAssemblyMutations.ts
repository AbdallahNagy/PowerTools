import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../../../shared/api/client";
import type { AssemblyInspectionDto, MutationResultDto } from "../model/contracts";
import { registrationKeys } from "./queryKeys";

export function useAssemblyMutations(connectionName: string | null) {
  const queryClient = useQueryClient();
  const meta = {
    connectionName: connectionName ?? undefined,
    noAuthRetry: true as const,
  };
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: registrationKeys.catalog(connectionName ?? ""),
    });

  const analyze = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("assembly", file);
      return apiPost<AssemblyInspectionDto>(
        "/api/plugin-registration/assemblies/analyze",
        formData,
        { meta },
      );
    },
  });
  const register = useMutation({
    mutationFn: ({
      file,
      isolationMode,
      sourceType,
    }: {
      file: File;
      isolationMode: number;
      sourceType: number;
    }) => {
      const formData = new FormData();
      formData.append("assembly", file);
      formData.append("isolationMode", String(isolationMode));
      formData.append("sourceType", String(sourceType));
      return apiPost<MutationResultDto>("/api/plugin-registration/assemblies", formData, {
        meta,
      });
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append("assembly", file);
      return apiPost<MutationResultDto>(
        `/api/plugin-registration/assemblies/${id}/update`,
        formData,
        { meta },
      );
    },
    onSuccess: invalidate,
  });

  return { analyze, register, update };
}
