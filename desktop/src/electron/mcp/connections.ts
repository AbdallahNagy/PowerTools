import type { SidecarAuth } from "../sidecarHeaders.js";
import { AgentToolError, type ConnectionListing, type ResolvedConnection } from "./types.js";

export interface ConnectionSummaryLike {
  id: string;
  organization: string | null;
  environment: string | null;
  legacyName: string | null;
  envUrl: string;
  crmType: "online" | "onpremise";
}

/** Mirrors `connectionDisplayName` in src/ui/shared/connections/connectionNaming.ts. Keep the two in step. */
export function connectionDisplayName(s: {
  organization: string | null;
  environment: string | null;
  legacyName?: string | null;
  envUrl: string;
}): string {
  if (s.organization && s.environment) return `${s.organization} · ${s.environment}`;
  if (s.legacyName) return s.legacyName;
  try {
    return new URL(s.envUrl).hostname;
  } catch {
    return s.envUrl;
  }
}

export interface ConnectionResolverDeps {
  summaries(): ConnectionSummaryLike[];
  activeId(): string | null;
  resolveAuth(id: string): Promise<SidecarAuth | { error: string }>;
}

export interface ConnectionResolver {
  resolve(name?: string): Promise<ResolvedConnection>;
  /** Gets fresh auth for a connection already resolved, for one retry after a 401. */
  refresh(conn: ResolvedConnection): Promise<ResolvedConnection>;
  list(): ConnectionListing[];
}

const SIGN_IN_PATTERN = /interaction|sign.?in|consent|cancel/i;

export function createConnectionResolver(deps: ConnectionResolverDeps): ConnectionResolver {
  const named = () =>
    deps.summaries().map((summary) => ({ summary, displayName: connectionDisplayName(summary) }));

  async function authFor(id: string, displayName: string): Promise<ResolvedConnection> {
    const auth = await deps.resolveAuth(id);
    if ("error" in auth) {
      if (SIGN_IN_PATTERN.test(auth.error)) {
        throw new AgentToolError(
          "SignInRequired",
          `Sign-in is required for "${displayName}"`,
          "Ask the user to sign in to this connection in Power Tools.",
        );
      }
      throw new AgentToolError("NoConnection", auth.error);
    }
    return { displayName, auth };
  }

  return {
    async resolve(name) {
      const all = named();
      if (name === undefined) {
        const activeId = deps.activeId();
        const active = activeId ? all.find((entry) => entry.summary.id === activeId) : undefined;
        if (!active) {
          throw new AgentToolError(
            "NoConnection",
            "There is no active connection",
            'Ask the user to connect in Power Tools, or pass "connection".',
          );
        }
        return authFor(active.summary.id, active.displayName);
      }
      const wanted = name.trim().toLowerCase();
      const matches = all.filter((entry) => entry.displayName.toLowerCase() === wanted);
      if (matches.length !== 1) {
        throw new AgentToolError(
          "ConnectionNotFound",
          `No single connection is named "${name}"`,
          `Valid names: ${all.map((entry) => entry.displayName).join(", ")}`,
        );
      }
      return authFor(matches[0].summary.id, matches[0].displayName);
    },
    refresh: (conn) => authFor(conn.auth.id, conn.displayName),
    list() {
      const activeId = deps.activeId();
      return named().map(({ summary, displayName }) => ({
        displayName,
        kind: summary.crmType,
        envUrl: summary.envUrl,
        active: summary.id === activeId,
      }));
    },
  };
}
