import { sidecarAuthHeaders } from "../sidecarHeaders.js";
import { AgentToolError, type AgentErrorCode, type ResolvedConnection } from "./types.js";

export type SidecarCall = (
  conn: ResolvedConnection,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  signal?: AbortSignal,
) => Promise<unknown>;

export interface SidecarCallerDeps {
  baseUrl: string;
  secret: string;
  fetch?: typeof fetch;
  /** Fresh auth for a connection, used for one retry after a 401 on a safe call. */
  refresh?: (conn: ResolvedConnection) => Promise<ResolvedConnection>;
}

const MAPPED_CODES: Record<string, AgentErrorCode> = {
  PermissionDenied: "DataverseFault",
  NoConnection: "NoConnection",
  DataverseFault: "DataverseFault",
  Throttled: "Throttled",
  Cancelled: "Cancelled",
  InvalidRequest: "InvalidRequest",
  Internal: "Internal",
};

// POST paths that only read, so a 401 can safely be replayed.
const REPLAYABLE_POSTS = new Set(["/api/community-tools/data/fetch", "/api/community-tools/data/retrieve"]);

function retryAfterSeconds(response: Response, message: string | undefined): number | undefined {
  const header = Number(response.headers.get("Retry-After"));
  if (Number.isFinite(header) && header > 0) return header;
  const fromMessage = message ? /Retry after (\d+)/i.exec(message) : null;
  return fromMessage ? Number(fromMessage[1]) : undefined;
}

async function toError(response: Response): Promise<AgentToolError> {
  type ErrorBody = { code?: unknown; message?: unknown; dataverseCode?: unknown };
  const body = await response.json().then(
    (value: unknown) => (typeof value === "object" ? (value as ErrorBody | null) : null),
    () => null,
  );
  const code = typeof body?.code === "string" && Object.prototype.hasOwnProperty.call(MAPPED_CODES, body.code) ? MAPPED_CODES[body.code] : undefined;
  if (!code) {
    return new AgentToolError("Internal", `The Power Tools sidecar answered ${response.status}`);
  }
  const message = typeof body?.message === "string" && body.message ? body.message : `The request failed (${code})`;
  const extra: { dataverseCode?: number; retryAfterSeconds?: number } = {};
  if (typeof body?.dataverseCode === "number") extra.dataverseCode = body.dataverseCode;
  if (response.status === 429) {
    const seconds = retryAfterSeconds(response, message);
    if (seconds !== undefined) extra.retryAfterSeconds = seconds;
  }
  return new AgentToolError(code, message, undefined, extra);
}

export function createSidecarCaller(deps: SidecarCallerDeps): SidecarCall {
  const doFetch = deps.fetch ?? fetch;

  async function send(
    conn: ResolvedConnection,
    method: "GET" | "POST",
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "X-Local-Secret": deps.secret,
      ...sidecarAuthHeaders(conn.auth),
    };
    if (method === "POST") headers["Content-Type"] = "application/json";
    return doFetch(`${deps.baseUrl}${path}`, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      signal,
    });
  }

  return async (conn, method, path, body, signal) => {
    try {
      let response = await send(conn, method, path, body, signal);
      const replayable = method === "GET" || REPLAYABLE_POSTS.has(path);
      if (response.status === 401 && replayable && deps.refresh) {
        response = await send(await deps.refresh(conn), method, path, body, signal);
      }
      if (!response.ok) throw await toError(response);
      const text = await response.text();
      return text ? (JSON.parse(text) as unknown) : null;
    } catch (error) {
      if (error instanceof AgentToolError) throw error;
      if (signal?.aborted) throw new AgentToolError("Cancelled", "The request was cancelled");
      throw new AgentToolError("Internal", "The Power Tools sidecar could not be reached");
    }
  };
}
