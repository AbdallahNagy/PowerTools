import { useMutation } from "@tanstack/react-query";
import { apiPost } from "../../../shared/api/client";
import type { ExecuteFetchRequest, FetchResult } from "../model/types";

export function useRunFetch(connectionId: string | null) {
  return useMutation({
    mutationFn: (req: ExecuteFetchRequest) =>
      apiPost<FetchResult>("/api/fetch/execute", req, {
        meta: { connectionId: connectionId ?? undefined },
      }),
  });
}
