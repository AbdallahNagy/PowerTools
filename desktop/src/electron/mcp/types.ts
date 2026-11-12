import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { EffectClass } from "../communityTools/messageEffects.js";
import type { SidecarAuth } from "../sidecarHeaders.js";

export type AgentErrorCode =
  | "NoConnection"
  | "ConnectionNotFound"
  | "SignInRequired"
  | "InvalidRequest"
  | "DataverseFault"
  | "Throttled"
  | "Cancelled"
  | "Internal";

export class AgentToolError extends Error {
  readonly code: AgentErrorCode;
  readonly hint?: string;
  readonly extra?: { dataverseCode?: number; retryAfterSeconds?: number };
  /** True when the message text came from Dataverse and so may carry text written by other people. */
  readonly untrusted: boolean;

  constructor(
    code: AgentErrorCode,
    message: string,
    hint?: string,
    extra?: { dataverseCode?: number; retryAfterSeconds?: number },
    untrusted = false,
  ) {
    super(message);
    this.name = "AgentToolError";
    this.code = code;
    this.hint = hint;
    this.extra = extra;
    this.untrusted = untrusted;
  }
}

export interface ResolvedConnection {
  displayName: string;
  auth: SidecarAuth;
}

export interface ConnectionListing {
  displayName: string;
  kind: "online" | "onpremise";
  envUrl: string;
  active: boolean;
}

export interface AgentToolContext {
  resolveConnection(name: string | undefined): Promise<ResolvedConnection>;
  callSidecar(
    conn: ResolvedConnection,
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown>;
  listConnections(): ConnectionListing[];
  signal: AbortSignal;
}

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, object>;
  required?: string[];
  additionalProperties: false;
}

export interface AgentTool {
  name: string;
  group: "connections" | "metadata" | "records";
  title: string;
  description: string;
  inputSchema: JsonSchemaObject;
  outputSchema?: JsonSchemaObject;
  effect: EffectClass | ((args: Record<string, unknown>) => EffectClass);
  /** Short, argument-free description for the activity log. Defaults to the tool name. */
  summarize?(args: Record<string, unknown>): string;
  run(args: Record<string, unknown>, ctx: AgentToolContext): Promise<CallToolResult>;
}
