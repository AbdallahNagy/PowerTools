import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  isInitializeRequest,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { EffectClass } from "../communityTools/messageEffects.js";
import type { ActivityEntry, ActivityLog } from "./activityLog.js";
import type { ApprovalGate } from "./approval.js";
import { toToolResult } from "./errors.js";
import { findGuide, MCP_GUIDES } from "./guides.js";
import type { AgentToolRegistry } from "./registry.js";
import type { ApprovalPlan } from "./approval.js";
import { planForDialog, planRemoves } from "./planDialog.js";
import { plannedResult, unchangedResult } from "./tools/applyTool.js";
import { AgentToolError, type AgentTool, type AgentToolContext, type PlanPreview, type ResolvedConnection } from "./types.js";

export interface McpRequestHandlerOptions {
  registry: AgentToolRegistry;
  context: () => Omit<AgentToolContext, "signal">;
  log: ActivityLog;
  /** Decides whether a call that is not a read may run. */
  gate: Pick<ApprovalGate, "decide">;
  instructions: string;
  appVersion?: string;
  /** How long an apply tool may take to build its plan. Default 2 minutes. */
  planTimeoutMs?: number;
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

function approvalError(outcome: "denied" | "timed-out" | "unavailable" | "cancelled"): AgentToolError {
  if (outcome === "cancelled") return new AgentToolError("Cancelled", "The call was cancelled");
  if (outcome === "denied") {
    return new AgentToolError("ApprovalDenied", "The user denied this action", "Do not retry; ask the user what to do instead.");
  }
  if (outcome === "timed-out") {
    return new AgentToolError("ApprovalTimedOut", "The user did not answer in time", "Ask the user to look at Power Tools.");
  }
  return new AgentToolError("ApprovalUnavailable", "Power Tools could not ask the user", "Ask the user to look at Power Tools.");
}

/**
 * Asks an apply tool for its plan. Building the plan has its own timeout and follows the client's cancel; the
 * approval timeout only starts once the dialog shows.
 */
async function buildPlanWith(
  tool: AgentTool,
  args: Record<string, unknown>,
  ctx: AgentToolContext,
  clientSignal: AbortSignal,
  timeoutMs: number,
): Promise<PlanPreview> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([clientSignal, timeout]);
  try {
    return await tool.plan!(args, {
      ...ctx,
      signal,
      callSidecar: (conn, method, path, body) => ctx.callSidecar(conn, method, path, body, signal),
    });
  } catch (error) {
    if (timeout.aborted && !clientSignal.aborted) {
      throw new AgentToolError("Timeout", "Building the plan took too long", "Try a smaller spec, or try again.");
    }
    throw error;
  }
}

/**
 * A tool with an output schema must answer structured content in that shape, error or not: SDK clients check it
 * on every result that has some and turn a mismatch into a protocol error, which hides the real error (such as
 * ApprovalDenied) from the agent. An error that is not an apply result keeps its text and drops the structured copy.
 */
function conformingResult(tool: AgentTool, result: CallToolResult): CallToolResult {
  if (!tool.outputSchema || result.isError !== true || !result.structuredContent) return result;
  if (typeof (result.structuredContent as { outcome?: unknown }).outcome === "string") return result;
  const textOnly = { ...result };
  delete textOnly.structuredContent;
  return textOnly;
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
  const planTimeoutMs = opts.planTimeoutMs ?? 120_000;
  const buildPlan = (tool: AgentTool, args: Record<string, unknown>, ctx: AgentToolContext, signal: AbortSignal) =>
    buildPlanWith(tool, args, ctx, signal, planTimeoutMs);

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
      { capabilities: { tools: { listChanged: true }, resources: {} }, instructions: opts.instructions },
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

    // Guides are static text the tool descriptions link to, so reading one needs no connection or approval.
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: MCP_GUIDES.map(({ uri, name, title, description }) => ({ uri, name, title, description, mimeType: "text/markdown" })),
    }));
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const guide = findGuide(request.params.uri);
      if (!guide) throw new McpError(ErrorCode.InvalidParams, `Unknown resource "${request.params.uri}"`);
      return { contents: [{ uri: guide.uri, mimeType: "text/markdown", text: guide.text }] };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<CallToolResult> => {
      const tool = opts.registry.get(request.params.name);
      if (!tool) throw new McpError(ErrorCode.InvalidParams, `Unknown tool "${request.params.name}"`);
      const checked = opts.registry.validate(tool, request.params.arguments);
      if (!checked.ok) throw new McpError(ErrorCode.InvalidParams, checked.message);
      const called: AgentTool = tool;
      const args = checked.args;

      // A client that sent a progress token wants to hear about long operations, at the start and at the end.
      const progressToken = tool.reportsProgress ? extra._meta?.progressToken : undefined;
      const reportProgress = async (progress: number) => {
        if (progressToken === undefined) return;
        try {
          await extra.sendNotification({ method: "notifications/progress", params: { progressToken, progress, total: 1 } });
        } catch {
          // The client may have gone; progress is only a courtesy.
        }
      };
      await reportProgress(0);

      let result: CallToolResult;
      let resolved: ResolvedConnection | undefined;
      const base = opts.context();
      const ctx: AgentToolContext = {
        ...base,
        // Remember what a tool resolved, so the log names the connection even when the call fails.
        resolveConnection: async (name) => (resolved = await base.resolveConnection(name)),
        callSidecar: (conn, method, path, body, signal) => base.callSidecar(conn, method, path, body, signal ?? extra.signal),
        signal: extra.signal,
      };

      let approval: ActivityEntry["approval"] = "not-needed";
      // Until it is known, a tool that is not plainly a read is logged as the worst case.
      let effect: EffectClass = tool.effect === "read" ? "read" : "destructive";
      let approvedPlan: PlanPreview | undefined;
      try {
        let runCtx = ctx;
        if (tool.effect !== "read") {
          // Resolve the connection once, here, so what the user approves is what runs.
          const connection = await ctx.resolveConnection(checked.args.connection as string | undefined);
          runCtx = { ...ctx, resolveConnection: async () => connection };

          let described: { summary: string; removes?: string; plan?: ApprovalPlan };
          if (tool.plan) {
            const plan = await buildPlan(tool, checked.args, runCtx, extra.signal);
            effect = plan.effect;
            if (checked.args.dryRun === true) {
              effect = "read";
              result = plannedResult(plan);
              return await finish(result);
            }
            if (plan.steps.length === 0) {
              effect = "read";
              result = unchangedResult(plan);
              return await finish(result);
            }
            approvedPlan = plan;
            runCtx = { ...runCtx, approvedPlan: plan };
            described = {
              summary: tool.describePlan?.(checked.args, plan) ?? tool.title,
              removes: planRemoves(plan),
              plan: planForDialog(plan),
            };
          } else {
            effect = typeof tool.effect === "function" ? await tool.effect(checked.args, runCtx) : tool.effect!;
            described = tool.describe?.(checked.args) ?? { summary: tool.title };
          }

          if (effect !== "read") {
            const outcome = await opts.gate.decide(
              {
                tool: tool.name,
                title: tool.title,
                connection: connection.displayName,
                effect,
                summary: described.summary,
                ...(described.removes ? { removes: described.removes } : {}),
                ...(described.plan ? { plan: described.plan } : {}),
                args: checked.args,
              },
              connection.allowsChanges,
              extra.signal,
            );
            approval = outcome;
            if (outcome !== "auto" && outcome !== "allowed") throw approvalError(outcome);
            if (outcome === "allowed" && base.refreshConnection) {
              // The same connection, with a token that outlasts the time the user took to answer.
              const fresh = await base.refreshConnection(connection);
              runCtx = { ...runCtx, resolveConnection: async () => fresh };
            }
          }
        }
        result = await tool.run(checked.args, runCtx);
      } catch (error) {
        result = toToolResult(error);
      }

      return await finish(result);

      async function finish(final: CallToolResult): Promise<CallToolResult> {
        await reportProgress(1);

        const structured = final.structuredContent as { connection?: unknown; code?: unknown } | undefined;
        const failed = final.isError === true;
        try {
          await opts.log.append({
            time: new Date().toISOString(),
            client: server.getClientVersion()?.name ?? null,
            tool: called.name,
            connection: resolved?.displayName ?? (!failed && typeof structured?.connection === "string" ? structured.connection : null),
            effect,
            approval,
            outcome: failed ? "error" : "ok",
            ...(failed && typeof structured?.code === "string" ? { code: structured.code } : {}),
            summary: called.summarize?.(args) ?? called.name,
            ...(approvedPlan
              ? { planHash: approvedPlan.hash, steps: approvedPlan.steps.map(({ op, target, effect: stepEffect }) => ({ op, target, effect: stepEffect })) }
              : {}),
          });
        } catch {
          // A log failure must not fail the call.
        }
        return conformingResult(called, final);
      }
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
