import { useQuery } from "@tanstack/react-query";

import { apiGet } from "../../../shared/api/client";

export interface PluginRegistrationCapabilities {
  transactionalCascadeUnregister: { supported: boolean; reason: string };
}

const unsupported: PluginRegistrationCapabilities = {
  transactionalCascadeUnregister: {
    supported: false,
    reason: "Transactional cascade unregister is not release-approved yet. Transactional safety has not yet been proven.",
  },
};

export function usePluginRegistrationCapabilities(connectionName: string | null) {
  return useQuery({
    queryKey: ["plugin-registration", "capabilities", connectionName],
    queryFn: () => apiGet<PluginRegistrationCapabilities>("/api/plugin-registration/capabilities", {
      meta: { connectionName: connectionName ?? undefined },
    }),
    enabled: Boolean(connectionName),
    staleTime: 30_000,
    retry: false,
  });
}

export function cascadeCapabilityFromQuery(
  data: PluginRegistrationCapabilities | undefined,
): { supported: boolean; reason: string } {
  return data?.transactionalCascadeUnregister ?? unsupported.transactionalCascadeUnregister;
}
