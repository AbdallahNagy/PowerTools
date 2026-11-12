import { describe, expect, it } from "vitest";
import { AgentToolError, toToolResult } from "../../../src/electron/mcp/errors";

describe("toToolResult", () => {
  it("formats an agent error with its hint", () => {
    const result = toToolResult(
      new AgentToolError("ConnectionNotFound", 'No connection named "X"', "Valid names: A · Dev, A · Test"),
    );
    expect(result).toEqual({
      isError: true,
      content: [{ type: "text", text: '[ConnectionNotFound] No connection named "X". Valid names: A · Dev, A · Test' }],
      structuredContent: { code: "ConnectionNotFound", message: 'No connection named "X"' },
    });
  });

  it("does not double a trailing period", () => {
    const result = toToolResult(new AgentToolError("InvalidRequest", "Bad input."));
    expect(result.content).toEqual([{ type: "text", text: "[InvalidRequest] Bad input." }]);
  });

  it("hides the text of unknown errors", () => {
    const result = toToolResult(new Error("boom with token abc"));
    expect(result.structuredContent).toEqual({ code: "Internal", message: "The server could not complete the request" });
    const text = JSON.stringify(result.content);
    expect(text).not.toContain("boom");
    expect(text).not.toContain("abc");
  });

  it("passes dataverseCode and retryAfterSeconds through", () => {
    const result = toToolResult(
      new AgentToolError("Throttled", "Too many requests", undefined, { dataverseCode: -2147015902, retryAfterSeconds: 7 }),
    );
    expect(result.structuredContent).toEqual({
      code: "Throttled",
      message: "Too many requests",
      dataverseCode: -2147015902,
      retryAfterSeconds: 7,
    });
  });
});
