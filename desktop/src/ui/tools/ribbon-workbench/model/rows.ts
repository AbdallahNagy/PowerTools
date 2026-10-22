import { items, type ItemKind } from "./diff";
import { attr, child, elements } from "./node";
import type { RibbonNode } from "./types";

export type ItemSource = "custom" | "customised" | "base";

export interface ItemRow {
  id: string;
  node: RibbonNode;
  source: ItemSource;
}

export const SOURCE_LABELS: Record<ItemSource, string> = {
  custom: "Custom",
  customised: "Customised",
  base: "Base",
};

/**
 * Rows for the Commands, Enable rules, or Display rules tab. The published ribbon already holds this
 * solution's own items, so an item the diff defines counts as Customised only when it overrides a
 * platform or other-layer item: a Mscrm id, a command copied with Customise command, or a command
 * that published controls use.
 */
export function itemRows(
  kind: Extract<ItemKind, "command" | "enableRule" | "displayRule">,
  diff: RibbonNode | null,
  baseNodes: readonly RibbonNode[],
  showBase: boolean,
  customised: ReadonlySet<string>,
  baseCommandRefs: ReadonlySet<string>,
): ItemRow[] {
  const baseIds = new Set(baseNodes.map((node) => attr(node, "Id") ?? ""));
  const own = items(diff, kind).map<ItemRow>((node) => {
    const id = attr(node, "Id") ?? "";
    const overrides =
      baseIds.has(id) &&
      (id.startsWith("Mscrm.") || customised.has(id) || (kind === "command" && baseCommandRefs.has(id)));
    return { id, node, source: overrides || customised.has(id) ? "customised" : "custom" };
  });
  if (!showBase) return own;
  const ownIds = new Set(own.map((row) => row.id));
  const base = baseNodes
    .filter((node) => !ownIds.has(attr(node, "Id") ?? ""))
    .map<ItemRow>((node) => ({ id: attr(node, "Id") ?? "", node, source: "base" }));
  return [...own, ...base];
}

/** A short text for a command's actions, such as "JavaScript: hello". */
export function actionSummary(command: RibbonNode): string {
  const actions = elements(child(command, "Actions"));
  if (actions.length === 0) return "None";
  return actions
    .map((action) => {
      if (action.name === "JavaScriptFunction") return `JavaScript: ${attr(action, "FunctionName") ?? "?"}`;
      if (action.name === "Url") return `URL: ${attr(action, "Address") ?? "?"}`;
      return action.name;
    })
    .join(", ");
}

export interface LabelRow {
  key: string;
  id: string;
  lcid: string;
  text: string;
}

export function labelRows(diff: RibbonNode | null): LabelRow[] {
  return items(diff, "label").flatMap((label) => {
    const id = attr(label, "Id") ?? "";
    const titles = elements(child(label, "Titles"));
    if (titles.length === 0) return [{ key: `${id}|`, id, lcid: "", text: "" }];
    return titles.map((title, index) => ({
      key: `${id}|${index}`,
      id,
      lcid: attr(title, "languagecode") ?? "",
      text: attr(title, "description") ?? "",
    }));
  });
}

export type SortDirection = "asc" | "desc";
export interface SortState {
  key: string;
  direction: SortDirection;
}

export function nextSort(current: SortState | null, key: string): SortState {
  return current?.key === key && current.direction === "asc" ? { key, direction: "desc" } : { key, direction: "asc" };
}

export function sortBy<T>(rows: readonly T[], sort: SortState | null, value: (row: T, key: string) => string | number): T[] {
  if (!sort) return [...rows];
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = value(left, sort.key);
    const b = value(right, sort.key);
    const order = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
    return order * factor;
  });
}

/** A copy of the list with one item moved. */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Ids of the given nodes, for "Not defined" hints. */
export function knownIds(...lists: (readonly RibbonNode[] | undefined)[]): Set<string> {
  const ids = new Set<string>();
  for (const list of lists) {
    for (const node of list ?? []) {
      const id = attr(node, "Id");
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function matches(query: string, ...values: (string | null | undefined)[]): boolean {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return values.some((value) => value?.toLowerCase().includes(text));
}
