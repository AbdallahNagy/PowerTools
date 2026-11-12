// Builds the sidecar auth headers for a connection. Shared by the renderer API client and the
// MCP server in main, so both talk to the sidecar the same way. Must stay import-free.

export interface SidecarAuth {
  id: string;
  envUrl: string;
  crmType: "online" | "onpremise";
  token?: string;
}

export function sidecarAuthHeaders(auth: SidecarAuth, prefix: "" | "Target-" = ""): Record<string, string> {
  if (auth.crmType === "online") {
    if (!auth.token) throw new Error("Missing token for online connection");
    return {
      [prefix ? `X-${prefix}Authorization` : "Authorization"]: `Bearer ${auth.token}`,
      [`X-${prefix}Environment-Url`]: auth.envUrl,
    };
  }
  // The sidecar keys on-premises connections by id; the header name predates ids.
  return { [`X-${prefix}Connection-Name`]: auth.id };
}
