import { describe, expect, it } from "vitest";
import {
  clampPageSize,
  dataverseResult,
  MAX_TEXT_BYTES,
  plainResult,
  TRUNCATION_NOTE,
  truncateText,
  UNTRUSTED_PREFIX,
} from "../../../src/electron/mcp/results";

describe("truncateText", () => {
  it("leaves short text alone", () => {
    expect(truncateText("hi")).toBe("hi");
  });

  it("caps long text and adds the note", () => {
    const out = truncateText("x".repeat(200 * 1024));
    expect(out.endsWith(TRUNCATION_NOTE)).toBe(true);
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(MAX_TEXT_BYTES);
  });

  it("stays within the cap for multi-byte text", () => {
    const out = truncateText("é".repeat(200 * 1024));
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(MAX_TEXT_BYTES);
    expect(out).not.toContain("�");
  });
});

describe("clampPageSize", () => {
  it("defaults, clamps and ignores non-numbers", () => {
    expect(clampPageSize(undefined)).toBe(50);
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(10000)).toBe(500);
    expect(clampPageSize("7")).toBe(50);
    expect(clampPageSize(7)).toBe(7);
  });
});

describe("results", () => {
  it("marks Dataverse results as untrusted", () => {
    const r = dataverseResult("1 row", { rows: [1] }, "A · Dev");
    expect(r._meta?.["powertools/untrusted"]).toBe(true);
    expect((r.content[0] as { text: string }).text.startsWith(UNTRUSTED_PREFIX)).toBe(true);
    expect(r.structuredContent).toEqual({ connection: "A · Dev", rows: [1] });
  });

  it("drops the structured copy of a too-large result so clients read the capped text", () => {
    const r = dataverseResult("big", { rows: ["x".repeat(200 * 1024)] }, "A · Dev");
    expect(r.structuredContent).toBeUndefined();
    const text = (r.content[0] as { text: string }).text;
    expect(text).toContain('"rows":["xxx');
    expect(text.endsWith(TRUNCATION_NOTE)).toBe(true);
  });

  it("does not mark plain results", () => {
    const r = plainResult("ok", { a: 1 });
    expect(r._meta).toBeUndefined();
    expect(r.structuredContent).toEqual({ a: 1 });
  });
});
