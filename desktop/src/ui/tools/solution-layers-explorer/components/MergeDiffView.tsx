import { useEffect, useRef } from "react";
import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import type { LayerDiffProps } from "./loadLayerDiff";

// Colors come from theme tokens: removed lines on the left, added lines on the right.
const diffTheme = EditorView.theme({
  "&": {
    color: "var(--color-fg)",
    backgroundColor: "var(--color-canvas)",
    fontSize: "var(--text-xs)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.25rem" },
  ".cm-content": { padding: "8px 0" },
  ".cm-gutters": {
    backgroundColor: "var(--color-canvas)",
    color: "var(--color-fg-muted)",
    borderRight: "1px solid var(--color-line)",
  },
  "&.cm-merge-a .cm-changedLine, .cm-deletedChunk": { backgroundColor: "var(--color-danger-soft)" },
  "&.cm-merge-b .cm-changedLine, .cm-inlineChangedLine": { backgroundColor: "var(--color-ok-soft)" },
  "&.cm-merge-a .cm-changedText, .cm-deletedChunk .cm-deletedText": {
    background: "var(--color-danger-soft)",
  },
  "&.cm-merge-b .cm-changedText": { background: "var(--color-ok-soft)" },
  "&.cm-merge-a .cm-changedLineGutter, .cm-deletedLineGutter": { background: "var(--color-danger)" },
  "&.cm-merge-b .cm-changedLineGutter": { background: "var(--color-ok)" },
});

function side(doc: string, label: string) {
  return {
    doc,
    extensions: [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.contentAttributes.of({ "aria-label": label, "aria-readonly": "true" }),
      lineNumbers(),
      diffTheme,
    ],
  };
}

/**
 * The CodeMirror merge view behind LayerDiff. Load it through LayerDiff, which imports
 * this module only when a diff is first shown.
 */
export default function MergeDiffView({ left, right, leftLabel, rightLabel }: LayerDiffProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = new MergeView({
      a: side(left, leftLabel),
      b: side(right, rightLabel),
      parent: hostRef.current!,
      gutter: true,
      highlightChanges: true,
    });
    return () => view.destroy();
  }, [left, right, leftLabel, rightLabel]);

  return (
    <div
      ref={hostRef}
      data-layer-diff=""
      className="h-full min-h-0 overflow-auto rounded-sm border border-line bg-canvas"
    />
  );
}
