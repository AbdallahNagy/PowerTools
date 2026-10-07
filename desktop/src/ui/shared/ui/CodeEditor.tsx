import { useEffect, useState } from "react";
import { cn } from "./cn";
import { loadedCodeEditor, preloadCodeEditor } from "./loadCodeEditor";

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  /** Runs on Ctrl+Enter (Cmd+Enter on macOS), for example to execute a query. */
  onSubmit?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  lineNumbers?: boolean;
  className?: string;
}

/**
 * XML code editor for FetchXML and other markup (CodeMirrorEditor.tsx). The
 * CodeMirror code loads on first use; until then a same-sized frame is shown.
 */
export function CodeEditor(props: CodeEditorProps) {
  const [Loaded, setLoaded] = useState(loadedCodeEditor);

  useEffect(() => {
    if (Loaded) return;
    let active = true;
    void preloadCodeEditor().then((component) => {
      if (active) setLoaded(() => component);
    });
    return () => {
      active = false;
    };
  }, [Loaded]);

  if (Loaded) return <Loaded {...props} />;

  // Same frame as the editor, so the layout does not jump when it loads.
  return (
    <div
      aria-busy="true"
      aria-label={props["aria-label"]}
      className={cn("min-h-0 rounded-sm border border-line bg-canvas", props.className)}
    />
  );
}
