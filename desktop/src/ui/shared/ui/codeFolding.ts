import { codeFolding, foldGutter, foldKeymap, foldService } from "@codemirror/language";
import { type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

function indentOf(text: string): number {
  return text.search(/\S/);
}

/**
 * Folds by indentation: a line folds over the lines after it that are indented
 * deeper. Works for formatted JSON, XML and scripts without a language parser.
 * The closing line at the same indent (such as `}`) stays visible.
 */
export const indentFoldService = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  const base = indentOf(line.text);
  if (base < 0) return null;
  let end = line.number;
  for (let number = line.number + 1; number <= state.doc.lines; number++) {
    const indent = indentOf(state.doc.line(number).text);
    if (indent < 0) continue;
    if (indent <= base) break;
    end = number;
  }
  if (end === line.number) return null;
  return { from: line.to, to: state.doc.line(end).to };
});

// Colors come from the theme tokens, like the editors that use this.
const foldTheme = EditorView.theme({
  ".cm-foldGutter .cm-gutterElement": {
    cursor: "pointer",
    color: "var(--color-fg-muted)",
    padding: "0 4px",
  },
  ".cm-foldGutter .cm-gutterElement:hover": { color: "var(--color-fg-strong)" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--color-hover)",
    border: "1px solid var(--color-line)",
    color: "var(--color-fg-muted)",
    borderRadius: "2px",
    padding: "0 4px",
    margin: "0 2px",
  },
});

/**
 * Collapse and expand for indented blocks: a gutter arrow on each foldable line,
 * plus Ctrl+Shift+[ and Ctrl+Shift+] (Cmd+Alt+[ and ] on macOS).
 * Import only from modules that are themselves loaded on first use, so
 * CodeMirror stays out of the main bundle.
 */
export function indentFolding(): Extension {
  return [
    indentFoldService,
    codeFolding({ placeholderText: "…" }),
    foldGutter({ openText: "⌄", closedText: "›" }),
    keymap.of(foldKeymap),
    foldTheme,
  ];
}
