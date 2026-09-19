import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../../shared/api/client";
import type { EntityAttributeDto } from "../model/contracts";
import { registrationKeys } from "./queryKeys";

export function useEntityAttributes(
  connectionName: string | null,
  logicalName: string | null,
) {
  return useQuery({
    queryKey: registrationKeys.entityAttributes(connectionName ?? "", logicalName ?? ""),
    queryFn: () =>
      apiGet<EntityAttributeDto[]>(
        `/api/metadata/entities/${logicalName}/attributes`,
        { meta: { connectionName: connectionName ?? undefined } },
      ),
    enabled: !!connectionName && !!logicalName && logicalName !== "none",
    staleTime: 5 * 60 * 1000,
  });
}
