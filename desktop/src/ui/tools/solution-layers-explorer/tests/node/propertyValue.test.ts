import { describe, expect, it } from "vitest";
import { displayValue, formatXml, shortValue, valueSummary } from "../../model/propertyValue";
import { base64 } from "../fixtures";

describe("formatXml", () => {
  it("indents nested elements and keeps text-only elements on one line", () => {
    expect(formatXml('<form><tabs><tab name="general"><label>General</label></tab></tabs><x/></form>')).toBe(
      [
        "<form>",
        "  <tabs>",
        '    <tab name="general">',
        "      <label>General</label>",
        "    </tab>",
        "  </tabs>",
        "  <x/>",
        "</form>",
      ].join("\n"),
    );
  });

  it("keeps declarations, comments and CDATA without indenting after them", () => {
    expect(formatXml('<?xml version="1.0"?><!-- note --><a><![CDATA[x < y]]></a>')).toBe(
      ['<?xml version="1.0"?>', "<!-- note -->", "<a>", "  <![CDATA[x < y]]>", "</a>"].join("\n"),
    );
  });

  it("never throws on unbalanced markup", () => {
    expect(formatXml("</a></b><c>")).toBe("</a>\n</b>\n<c>");
  });
});

describe("displayValue", () => {
  it("formats XML, JSON text and objects; leaves other text alone", () => {
    expect(displayValue(60, "formxml", "<form><tab/></form>")).toEqual({
      text: "<form>\n  <tab/>\n</form>",
      format: "xml",
      decoded: false,
    });
    expect(displayValue(1, "settings", '{"a":1}')).toEqual({ text: '{\n  "a": 1\n}', format: "json", decoded: false });
    expect(displayValue(1, "label", { LocalizedLabels: [] })).toEqual({
      text: '{\n  "LocalizedLabels": []\n}',
      format: "json",
      decoded: false,
    });
    expect(displayValue(1, "name", "{not json")).toEqual({ text: "{not json", format: "text", decoded: false });
    expect(displayValue(1, "isaudited", true)).toEqual({ text: "true", format: "text", decoded: false });
    expect(displayValue(1, "description", null)).toEqual({ text: "", format: "empty", decoded: false });
  });

  it("decodes web resource content only", () => {
    expect(displayValue(61, "content", base64("let a;"))).toEqual({ text: "let a;", format: "text", decoded: true });
    expect(displayValue(61, "content", base64("<svg><g/></svg>"))).toEqual({
      text: "<svg>\n  <g/>\n</svg>",
      format: "xml",
      decoded: true,
    });
    expect(displayValue(60, "content", base64("let a;")).decoded).toBe(false);
  });
});

describe("table cell values", () => {
  it("shows short values in full and summarizes long ones", () => {
    expect(shortValue(2, "maxlength", 100)).toBe("100");
    expect(shortValue(2, "requiredlevel", { Value: 2 })).toBe('{"Value":2}');
    expect(shortValue(2, "description", null)).toBe("");
    expect(shortValue(60, "formxml", `<form>${"<tab/>".repeat(30)}</form>`)).toBeNull();
    expect(shortValue(61, "content", "YQ==")).toBeNull();

    expect(valueSummary(60, "formxml", "<form><tab/></form>")).toBe("<form><tab/></form>");
    expect(valueSummary(60, "formxml", `<form>${"<tab/>".repeat(30)}</form>`)).toBe("XML · 32 lines");
    expect(valueSummary(61, "content", base64("a;\nb;"))).toBe("Decoded Text · 2 lines");
    expect(valueSummary(1, "notes", "x".repeat(90))).toBe("Text · 90 characters");
  });
});
