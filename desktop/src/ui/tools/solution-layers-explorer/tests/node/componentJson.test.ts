import { describe, expect, it } from "vitest";
import {
  decodeBase64Text,
  deepEqual,
  diffProperties,
  diffValue,
  formatValue,
  parseComponentJson,
  prettyText,
} from "../../model/componentJson";
import { bulkToast, defaultComparePair, nextSort, removeDisabledReason, sortComponents } from "../../model/view";
import { activeLayer, base64, baseLayer, patchLayer, scriptLayersFixture, styleLayersFixture } from "../fixtures";

describe("parseComponentJson", () => {
  it("reads the Attributes Key/Value list", () => {
    const parsed = parseComponentJson('{"Attributes":[{"Key":"name","Value":"a"},{"Key":"size","Value":{"n":1}}]}');
    expect(parsed).toEqual({ ok: true, properties: { name: "a", size: { n: 1 } } });
  });

  it("accepts lower-case field names and skips entries without a key", () => {
    const parsed = parseComponentJson('{"attributes":[{"key":"name","value":1},{"value":2},"x"]}');
    expect(parsed).toEqual({ ok: true, properties: { name: 1 } });
  });

  it("reads a plain object by its own keys", () => {
    expect(parseComponentJson('{"a":1}')).toEqual({ ok: true, properties: { a: 1 } });
  });

  it("treats empty text as no properties and anything else as unreadable", () => {
    expect(parseComponentJson("")).toEqual({ ok: true, properties: {} });
    expect(parseComponentJson(null)).toEqual({ ok: true, properties: {} });
    expect(parseComponentJson("{not json").ok).toBe(false);
    expect(parseComponentJson("[1,2]").ok).toBe(false);
    expect(parseComponentJson('"text"').ok).toBe(false);
  });
});

describe("diffProperties", () => {
  it("pairs keys and flags differences, one-sided keys, and deep equality", () => {
    const rows = diffProperties(
      { same: { a: [1, { b: 2 }] }, changed: 1, left: true },
      { same: { a: [1, { b: 2 }] }, changed: 2, right: true },
    );
    expect(rows).toEqual([
      { key: "same", status: "equal" },
      { key: "changed", status: "different" },
      { key: "left", status: "onlyLeft" },
      { key: "right", status: "onlyRight" },
    ]);
  });

  it("compares objects regardless of key order and arrays by position", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
  });
});

describe("text helpers", () => {
  it("pretty-prints JSON text and leaves other text alone", () => {
    expect(prettyText('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyText("plain <xml/>")).toBe("plain <xml/>");
    expect(prettyText("42")).toBe("42");
    expect(formatValue({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatValue(null)).toBe("");
    expect(formatValue('["x"]')).toBe('[\n  "x"\n]');
  });

  it("decodes UTF-8 base64 and strips the byte order mark", () => {
    expect(decodeBase64Text(base64("é = 1;"))).toBe("é = 1;");
    expect(decodeBase64Text("not base64!")).toBeNull();
    expect(decodeBase64Text("")).toBeNull();
  });

  it("decodes only web resource content", () => {
    expect(diffValue(61, "content", base64("let a;"))).toEqual({ text: "let a;", decoded: true });
    expect(diffValue(60, "content", base64("let a;")).decoded).toBe(false);
    expect(diffValue(61, "name", "new_/a.js")).toEqual({ text: "new_/a.js", decoded: false });
  });
});

describe("view helpers", () => {
  it("defaults compare to the layer under the top layer on the left", () => {
    expect(defaultComparePair([activeLayer, patchLayer, baseLayer])).toEqual({
      left: "layer-patch",
      right: "layer-active",
    });
    expect(defaultComparePair([activeLayer])).toEqual({ left: "layer-active", right: "layer-active" });
    expect(defaultComparePair([])).toEqual({ left: null, right: null });
  });

  it("explains why removal is disabled", () => {
    expect(removeDisabledReason(scriptLayersFixture)).toBeNull();
    expect(removeDisabledReason(styleLayersFixture)).toMatch(/only in the Active layer/);
    expect(removeDisabledReason({ ...scriptLayersFixture, hasActiveLayer: false, canRemoveActive: false })).toBe(
      "No Active layer",
    );
  });

  it("toggles sort direction on the same header and resets on another", () => {
    expect(nextSort({ key: "name", direction: "asc" }, "name")).toEqual({ key: "name", direction: "desc" });
    expect(nextSort({ key: "name", direction: "desc" }, "logicalName")).toEqual({
      key: "logicalName",
      direction: "asc",
    });
    const rows = sortComponents(
      [
        { componentId: "1", componentType: 1, name: "b", logicalName: "b", parentEntity: null },
        { componentId: "2", componentType: 1, name: "A", logicalName: "a", parentEntity: null },
      ],
      { key: "name", direction: "desc" },
    );
    expect(rows.map((row) => row.name)).toEqual(["b", "A"]);
  });

  it("summarizes a bulk run", () => {
    const removed = { componentId: "1", name: "a", result: "Removed" as const, detail: "" };
    const skipped = { componentId: "2", name: "b", result: "Skipped" as const, detail: "" };
    const failed = { componentId: "3", name: "c", result: "Failed" as const, detail: "x" };
    expect(bulkToast([removed], 1)).toEqual({ message: "Removed 1 Active layer.", type: "success" });
    expect(bulkToast([removed, skipped, failed], 3)).toEqual({
      message: "Removed 1 of 3 Active layers. 1 skipped, 1 failed.",
      type: "info",
    });
    expect(bulkToast([skipped, failed], 2)).toEqual({ message: "No Active layers were removed.", type: "error" });
  });
});
