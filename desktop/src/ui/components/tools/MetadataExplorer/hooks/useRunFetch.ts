import { useMutation } from "@tanstack/react-query";
import { apiPost } from "../../../../api/client";
import type { ExecuteFetchRequest, FetchResult } from "../model/types";

export function useRunFetch(connectionName: string | null) {
  return useMutation({
    mutationFn: (req: ExecuteFetchRequest) =>
      apiPost<FetchResult>("/api/fetch/execute", req, {
        meta: { connectionName: connectionName ?? undefined },
      }),
  });
}
