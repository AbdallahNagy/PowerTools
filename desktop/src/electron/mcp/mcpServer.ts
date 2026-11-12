import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  isInitializeRequest,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { EffectClass } from "../communityTools/messageEffects.js";
import type { ActivityLog } from "./activityLog.js";
import { toToolResult } from "./errors.js";
import type { AgentToolRegistry } from "./registry.js";
import type { AgentToolContext } from "./types.js";

export interface McpRequestHandlerOptions {
  registry: AgentToolRegistry;
  context: () => Omit<AgentToolContext, "signal">;
  log: ActivityLog;
  instructions: string;
  appVersion?: string;
  /** Clock for session idle tracking. Tests inject one. */
  now?: () => number;
  /** A session with no request and no open stream for this long is closed. Default 30 minutes. */
  idleMs?: number;
  /** Most live sessions; the least recently seen is closed to make room. Default 32. */
  maxSessions?: number;
  /** How often idle sessions are looked for. Default 60 seconds. */
  sweepMs?: number;
}

export interface McpRequestHandler {
  handle(req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void>;
  closeAll(): Promise<void>;
  notifyToolsChanged(): void;
  /** Closes sessions that have been idle too long. Runs on a timer; exposed for tests. */
  sweep(): Promise<void>;
  sessionCount(): number;
}

interface Session {
  server: Server;
  transport: StreamableHTTPServerTransport;
  lastSeen: number;
  /** Open GET streams; a session with one is in use. */
  streams: number;
}

function jsonRpcError(res: ServerResponse, status: number, code: number, message: string) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code, message } }));
}

export function createMcpRequestHandler(opts: McpRequestHandlerOptions): McpRequestHandler {
  const sessions = new Map<string, Session>();
  const now = opts.now ?? Date.now;
  const idleMs = opts.idleMs ?? 30 * 60_000;
  const maxSessions = opts.maxSessions ?? 32;

  function closeSession(id: string): Promise<void> {
    const session = sessions.get(id);
    sessions.delete(id);
    return session ? session.server.close().catch(() => undefined) : Promise.resolve();
  }

  async function sweep() {
    const cutoff = now() - idleMs;
    const idle = [...sessions].filter(([, s]) => s.streams === 0 && s.lastSeen <= cutoff).map(([id]) => id);
    await Promise.all(idle.map(closeSession));
  }

  const timer = setInterval(() => void sweep(), opts.sweepMs ?? 60_000);
  timer.unref();

  function createSession(): Session {
    const server = new Server(
      { name: "powertools", version: opts.appVersion ?? "0.0.0" },
      { capabilities: { tools: { listChanged: true } }, instructions: opts.instructions },
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, session);
      },
    });
    const session: Session = { server, transport, lastSeen: now(), streams: 0 };
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: opts.registry.list() }));

    server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<CallToolResult> => {
      const tool = opts.registry.get(request.params.name);
      if (!tool) throw new McpError(ErrorCode.InvalidParams, `Unknown tool "${request.params.name}"`);
      const checked = opts.registry.validate(tool, request.params.arguments);
      if (!checked.ok) throw new McpError(ErrorCode.InvalidParams, checked.message);

      const base = opts.context();
      const ctx: AgentToolContext = {
        ...base,
        callSidecar: (conn, method, path, body) => base.callSidecar(conn, method, path, body, extra.signal),
        signal: extra.signal,
      };

      let result: CallToolResult;
      try {
        result = await tool.run(checked.args, ctx);
      } catch (error) {
        result = toToolResult(error);
      }

      const effect: EffectClass = typeof tool.effect === "function" ? tool.effect(checked.args) : tool.effect;
      const structured = result.structuredContent as { connection?: unknown; code?: unknown } | undefined;
      const failed = result.isError === true;
      try {
        await opts.log.append({
          time: new Date().toISOString(),
          client: server.getClientVersion()?.name ?? null,
          tool: tool.name,
          connection: !failed && typeof structured?.connection === "string" ? structured.connection : null,
          effect,
          approval: "not-needed",
          outcome: failed ? "error" : "ok",
          ...(failed && typeof structured?.code === "string" ? { code: structured.code } : {}),
          summary: tool.summarize?.(checked.args) ?? tool.name,
        });
      } catch {
        // A log failure must not fail the call.
      }
      return result;
    });

    return session;
  }

  return {
    async handle(req, res, body) {
      const header = req.headers["mcp-session-id"];
      const sessionId = Array.isArray(header) ? header[0] : header;

      if (sessionId) {
        const session = sessions.get(sessionId);
        if (!session) {
          jsonRpcError(res, 404, -32001, "Session not found");
          return;
        }
        session.lastSeen = now();
        if (req.method === "GET") {
          session.streams += 1;
          res.on("close", () => {
            session.streams -= 1;
            session.lastSeen = now();
          });
        }
        await session.transport.handleRequest(req, res, body);
        return;
      }

      if (req.method === "POST" && isInitializeRequest(body)) {
        while (sessions.size >= maxSessions) {
          const oldest = [...sessions].reduce((a, b) => (b[1].lastSeen < a[1].lastSeen ? b : a));
          await closeSession(oldest[0]);
        }
        const session = createSession();
        await session.server.connect(session.transport);
        await session.transport.handleRequest(req, res, body);
        return;
      }

      jsonRpcError(res, 400, -32000, "Bad Request: a session id is required");
    },

    sweep,
    sessionCount: () => sessions.size,

    async closeAll() {
      clearInterval(timer);
      const open = [...sessions.values()];
      sessions.clear();
      await Promise.allSettled(open.map((session) => session.server.close()));
    },

    notifyToolsChanged() {
      for (const session of sessions.values()) {
        void session.server.sendToolListChanged().catch(() => undefined);
      }
    },
  };
}
