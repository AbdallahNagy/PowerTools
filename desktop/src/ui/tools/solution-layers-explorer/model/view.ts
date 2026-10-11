import type { ComponentRow, Layer, LayersResponse, RemovalEntry } from "./types";
import type { PropertyDiff } from "./componentJson";

export type SortDirection = "asc" | "desc";

export interface SortState<Key extends string> {
  key: Key;
  direction: SortDirection;
}

export type ComponentSortKey = "name" | "logicalName" | "parentEntity";
export type PropertySortKey = "key" | "status";

/** First click on a header sorts ascending; the same header again toggles the direction. */
export function nextSort<Key extends string>(current: SortState<Key>, key: Key): SortState<Key> {
  if (current.key !== key) return { key, direction: "asc" };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

const compareText = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });

export function sortComponents(rows: ComponentRow[], sort: SortState<ComponentSortKey>): ComponentRow[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const primary = compareText(left[sort.key] ?? "", right[sort.key] ?? "");
    if (primary !== 0) return primary * sign;
    return compareText(left.logicalName, right.logicalName);
  });
}

export const STATUS_LABELS: Record<PropertyDiff["status"], string> = {
  different: "Different",
  onlyLeft: "Only left",
  onlyRight: "Only right",
  equal: "",
};

export function sortProperties(rows: PropertyDiff[], sort: SortState<PropertySortKey>): PropertyDiff[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const primary = sort.key === "key"
      ? compareText(left.key, right.key)
      : compareText(STATUS_LABELS[left.status], STATUS_LABELS[right.status]);
    if (primary !== 0) return primary * sign;
    return compareText(left.key, right.key);
  });
}

export function layerOptionLabel(layer: Layer): string {
  return `${layer.order} · ${layer.solutionName}`;
}

/** Left is the layer directly under the top layer; right is the top layer. */
export function defaultComparePair(layers: Layer[]): { left: string | null; right: string | null } {
  const top = layers[0]?.id ?? null;
  return { left: layers[1]?.id ?? top, right: top };
}

export function formatOverwriteTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

/** Why Remove Active layer is disabled, or null when it is enabled. */
export function removeDisabledReason(layers: LayersResponse | undefined): string | null {
  if (!layers) return "No Active layer";
  if (!layers.hasActiveLayer) return "No Active layer";
  if (!layers.canRemoveActive) {
    return "This component exists only in the Active layer, so there is nothing to fall back to.";
  }
  return null;
}

export function layersStatus(layers: LayersResponse): string {
  const count = layers.layers.length;
  const noun = count === 1 ? "layer" : "layers";
  return `${count} ${noun} · ${layers.hasActiveLayer ? "Active layer present" : "No Active layer"}`;
}

export interface BulkSummary {
  removed: number;
  skipped: number;
  failed: number;
}

export function summarize(entries: RemovalEntry[]): BulkSummary {
  return {
    removed: entries.filter((entry) => entry.result === "Removed").length,
    skipped: entries.filter((entry) => entry.result === "Skipped").length,
    failed: entries.filter((entry) => entry.result === "Failed").length,
  };
}

/** The toast after a bulk run of `total` components. */
export function bulkToast(entries: RemovalEntry[], total: number): { message: string; type: "success" | "info" | "error" } {
  const { removed, skipped, failed } = summarize(entries);
  if (removed === 0) return { message: "No Active layers were removed.", type: "error" };
  if (removed === total) {
    return { message: `Removed ${total} Active ${total === 1 ? "layer" : "layers"}.`, type: "success" };
  }
  return {
    message: `Removed ${removed} of ${total} Active layers. ${skipped} skipped, ${failed} failed.`,
    type: "info",
  };
}
