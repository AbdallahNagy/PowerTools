import { useMutation } from "@tanstack/react-query";
import { apiPost } from "../../../shared/api/client";
import type { ExecuteFetchRequest, FetchResult } from "../model/types";

export function useRunFetch(connectionName: string | null) {
  return useMutation({
    mutationFn: (request: ExecuteFetchRequest) =>
      apiPost<FetchResult>("/api/fetch/execute", request, {
        meta: { connectionName: connectionName ?? undefined },
      }),
  });
}
