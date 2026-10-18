import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { EntityAttributeDto } from "../model/contracts";
import { registrationKeys } from "./queryKeys";

export function useEntityAttributes(
  connectionId: string | null,
  logicalName: string | null,
) {
  return useQuery({
    queryKey: registrationKeys.entityAttributes(connectionId ?? "", logicalName ?? ""),
    queryFn: () =>
      apiGet<EntityAttributeDto[]>(
        `/api/metadata/entities/${logicalName}/attributes`,
        { meta: { connectionId: connectionId ?? undefined } },
      ),
    enabled: !!connectionId && !!logicalName && logicalName !== "none",
    staleTime: 5 * 60 * 1000,
  });
}
