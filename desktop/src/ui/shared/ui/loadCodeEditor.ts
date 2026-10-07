import type { ComponentType } from "react";
import type { CodeEditorProps } from "./CodeEditor";

// CodeMirror is about a third of the renderer bundle, so it is loaded the first
// time a tool shows an editor rather than at app start. Once loaded, every
// later editor renders immediately.
let loaded: ComponentType<CodeEditorProps> | null = null;
let loading: Promise<ComponentType<CodeEditorProps>> | null = null;

/** The editor component if its code has already loaded. */
export function loadedCodeEditor(): ComponentType<CodeEditorProps> | null {
  return loaded;
}

/** Loads the editor code. Safe to call more than once. */
export function preloadCodeEditor(): Promise<ComponentType<CodeEditorProps>> {
  loading ??= import("./CodeMirrorEditor").then((module) => {
    loaded = module.default;
    return loaded;
  });
  return loading;
}
