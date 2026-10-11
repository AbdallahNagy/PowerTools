import type { ComponentType } from "react";

export interface LayerDiffProps {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
}

// The merge view brings in CodeMirror, so it loads the first time a diff is shown
// instead of with the app.
let loaded: ComponentType<LayerDiffProps> | null = null;
let loading: Promise<ComponentType<LayerDiffProps>> | null = null;

/** The diff component if its code has already loaded. */
export function loadedLayerDiff(): ComponentType<LayerDiffProps> | null {
  return loaded;
}

/** Loads the diff code. Safe to call more than once. */
export function preloadLayerDiff(): Promise<ComponentType<LayerDiffProps>> {
  loading ??= import("./MergeDiffView").then((module) => {
    loaded = module.default;
    return loaded;
  });
  return loading;
}
