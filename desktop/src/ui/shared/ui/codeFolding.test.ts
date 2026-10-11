import { foldable } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { indentFoldService } from "./codeFolding";

const json = [
  "{",
  '  "Attributes": [',
  "    {",
  '      "Key": "name",',
  '      "Value": "Account"',
  "    }",
  "  ]",
  "}",
].join("\n");

function foldAt(doc: string, lineNumber: number) {
  const state = EditorState.create({ doc, extensions: [indentFoldService] });
  const line = state.doc.line(lineNumber);
  const range = foldable(state, line.from, line.to);
  if (!range) return null;
  return { from: state.doc.lineAt(range.from).number, to: state.doc.lineAt(range.to).number };
}

describe("indentFoldService", () => {
  it("folds a block over its deeper-indented lines and keeps the closing line visible", () => {
    expect(foldAt(json, 1)).toEqual({ from: 1, to: 7 });
    expect(foldAt(json, 2)).toEqual({ from: 2, to: 6 });
    expect(foldAt(json, 3)).toEqual({ from: 3, to: 5 });
  });

  it("does not fold leaf lines, closing lines, or blank lines", () => {
    expect(foldAt(json, 4)).toBeNull();
    expect(foldAt(json, 8)).toBeNull();
    expect(foldAt("a\n\nb", 2)).toBeNull();
  });

  it("skips blank lines inside a block", () => {
    expect(foldAt("<form>\n  <tab>\n\n  </tab>\n</form>", 1)).toEqual({ from: 1, to: 4 });
  });
});
