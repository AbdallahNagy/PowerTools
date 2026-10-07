import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { xml } from "@codemirror/lang-xml";
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { Annotation, Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderText,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useFieldControl } from "./useFieldControl";
import { cn } from "./cn";
import type { CodeEditorProps } from "./CodeEditor";


// Colors come from the theme tokens, so the editor follows the dark and light themes.
const editorTheme = EditorView.theme({
  "&": {
    color: "var(--color-fg)",
    backgroundColor: "var(--color-canvas)",
    fontSize: "var(--text-xs)",
    height: "100%",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.25rem" },
  ".cm-content": { caretColor: "var(--color-fg-strong)", padding: "8px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-fg-strong)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--color-accent-soft)",
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--color-hover) 50%, transparent)" },
  ".cm-gutters": {
    backgroundColor: "var(--color-canvas)",
    color: "var(--color-fg-muted)",
    borderRight: "1px solid var(--color-line)",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--color-fg)" },
  ".cm-placeholder": { color: "var(--color-fg-muted)" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "var(--color-accent-soft)" },
});

/** Marks changes that came from the `value` prop, so they are not echoed to onChange. */
const external = Annotation.define<boolean>();

const xmlHighlight = HighlightStyle.define([
  { tag: [tags.tagName, tags.angleBracket], color: "var(--color-accent-text)" },
  { tag: tags.attributeName, color: "var(--color-alt)" },
  { tag: [tags.attributeValue, tags.string], color: "var(--color-ok)" },
  { tag: tags.comment, color: "var(--color-fg-muted)", fontStyle: "italic" },
  { tag: tags.invalid, color: "var(--color-danger)" },
]);

/**
 * The CodeMirror implementation behind CodeEditor. Load it through CodeEditor,
 * which imports this module only when an editor is first shown.
 *
 * XML code editor (CodeMirror 6) for FetchXML and other markup. Has syntax
 * highlighting, undo history, auto-closing tags, and Tab to indent; Escape
 * then Tab moves focus out of the editor.
 */
export default function CodeMirrorEditor({
  value,
  onChange,
  onSubmit,
  readOnly = false,
  placeholder,
  "aria-label": ariaLabel,
  lineNumbers: showLineNumbers = true,
  className,
}: CodeEditorProps) {
  const field = useFieldControl();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onSubmit });
  callbacks.current = { onChange, onSubmit };
  const config = useRef(new Compartment());

  const configuration: Extension = [
    EditorState.readOnly.of(readOnly),
    showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
    readOnly ? [] : highlightActiveLine(),
    placeholder ? placeholderText(placeholder) : [],
    EditorView.contentAttributes.of({
      ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      ...(field.id ? { id: field.id } : {}),
      ...(field["aria-describedby"] ? { "aria-describedby": field["aria-describedby"] } : {}),
      ...(field["aria-invalid"] ? { "aria-invalid": "true" } : {}),
      ...(readOnly ? { "aria-readonly": "true" } : {}),
    }),
  ];

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          xml(),
          syntaxHighlighting(xmlHighlight),
          editorTheme,
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                if (!callbacks.current.onSubmit) return false;
                callbacks.current.onSubmit();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            if (update.transactions.some((tr) => tr.annotation(external))) return;
            callbacks.current.onChange?.(update.state.doc.toString());
          }),
          config.current.of(configuration),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The view is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply a value set from outside, such as loading a saved query.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        annotations: external.of(true),
      });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: config.current.reconfigure(configuration) });
    // `configuration` is rebuilt from these inputs on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, placeholder, ariaLabel, showLineNumbers, field.id, field["aria-describedby"], field["aria-invalid"]]);

  return (
    <div
      ref={hostRef}
      data-code-editor=""
      className={cn(
        "min-h-0 overflow-hidden rounded-sm border border-line focus-within:border-focus",
        field["aria-invalid"] && "border-danger",
        className,
      )}
    />
  );
}
