import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AgentToolError } from "./types.js";

export { AgentToolError } from "./types.js";

/** Turns anything a tool threw into the uniform error result. Unknown errors never leak their text. */
export function toToolResult(error: unknown): CallToolResult {
  const e = error instanceof AgentToolError
    ? error
    : new AgentToolError("Internal", "The server could not complete the request");
  const sentence = e.message.endsWith(".") ? e.message : `${e.message}.`;
  const text = `[${e.code}] ${sentence}${e.hint ? ` ${e.hint}` : ""}`;
  const structured: Record<string, unknown> = { code: e.code, message: e.message };
  if (e.extra?.dataverseCode !== undefined) structured.dataverseCode = e.extra.dataverseCode;
  if (e.extra?.retryAfterSeconds !== undefined) structured.retryAfterSeconds = e.extra.retryAfterSeconds;
  return { isError: true, content: [{ type: "text", text }], structuredContent: structured };
}
