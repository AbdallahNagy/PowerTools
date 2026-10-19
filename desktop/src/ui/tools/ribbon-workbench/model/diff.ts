import { attr, canonical, child, childrenNamed, el, elements } from "./node";
import type { RibbonNode } from "./types";

/** Items a RibbonDiffXml holds, by kind. */
export type ItemKind = "customAction" | "hideAction" | "command" | "enableRule" | "displayRule" | "label";

interface Section {
  path: readonly string[];
  item: string;
  key: string;
}

export const SECTIONS: Record<ItemKind, Section> = {
  customAction: { path: ["CustomActions"], item: "CustomAction", key: "Id" },
  hideAction: { path: ["CustomActions"], item: "HideCustomAction", key: "HideActionId" },
  command: { path: ["CommandDefinitions"], item: "CommandDefinition", key: "Id" },
  enableRule: { path: ["RuleDefinitions", "EnableRules"], item: "EnableRule", key: "Id" },
  displayRule: { path: ["RuleDefinitions", "DisplayRules"], item: "DisplayRule", key: "Id" },
  label: { path: ["LocLabels"], item: "LocLabel", key: "Id" },
};

const ITEM_KINDS = Object.keys(SECTIONS) as ItemKind[];

/** Child order the ribbon schema requires. */
const ORDER: Record<string, readonly string[]> = {
  RibbonDiffXml: ["CustomActions", "Templates", "CommandDefinitions", "RuleDefinitions", "LocLabels"],
  RuleDefinitions: ["TabDisplayRules", "DisplayRules", "EnableRules"],
};

export function emptyDiff(): RibbonNode {
  return el("RibbonDiffXml", {}, [
    el("CustomActions"),
    el("Templates", {}, [el("RibbonTemplates", { Id: "Mscrm.RTE.Templates" })]),
    el("CommandDefinitions"),
    el("RuleDefinitions", {}, [el("TabDisplayRules"), el("DisplayRules"), el("EnableRules")]),
    el("LocLabels"),
  ]);
}

export function itemKey(kind: ItemKind, node: RibbonNode): string {
  return attr(node, SECTIONS[kind].key) ?? "";
}

export function items(diff: RibbonNode | null | undefined, kind: ItemKind): RibbonNode[] {
  const { path, item } = SECTIONS[kind];
  let container: RibbonNode | null = diff ?? null;
  for (const name of path) container = child(container, name);
  return childrenNamed(container, item);
}

export function findItem(diff: RibbonNode | null | undefined, kind: ItemKind, id: string): RibbonNode | null {
  return items(diff, kind).find((node) => itemKey(kind, node) === id) ?? null;
}

/** Inserts a missing child where the schema order puts it. */
function ensureChild(parent: RibbonNode, name: string): { parent: RibbonNode; index: number } {
  const existing = parent.children.findIndex((item) => item.name === name);
  if (existing >= 0) return { parent, index: existing };
  const order = ORDER[parent.name] ?? [];
  const rank = order.indexOf(name);
  let index = parent.children.length;
  if (rank >= 0) {
    const after = parent.children.findIndex((item) => {
      const itemRank = order.indexOf(item.name);
      return itemRank > rank;
    });
    if (after >= 0) index = after;
  }
  const children = [...parent.children];
  children.splice(index, 0, el(name));
  return { parent: { ...parent, children }, index };
}

function updateSection(
  diff: RibbonNode,
  path: readonly string[],
  update: (container: RibbonNode) => RibbonNode,
): RibbonNode {
  if (path.length === 0) return update(diff);
  const [name, ...rest] = path as [string, ...string[]];
  const { parent, index } = ensureChild(diff, name);
  const children = [...parent.children];
  children[index] = updateSection(children[index]!, rest, update);
  return { ...parent, children };
}

/**
 * Replaces the item whose key is `replaceId` (default: the new node's key), or appends it.
 * Missing containers are created in schema order.
 */
export function setItem(diff: RibbonNode, kind: ItemKind, node: RibbonNode, replaceId?: string): RibbonNode {
  const { path, item } = SECTIONS[kind];
  const id = replaceId ?? itemKey(kind, node);
  return updateSection(diff, path, (container) => {
    const index = container.children.findIndex((entry) => entry.name === item && itemKey(kind, entry) === id);
    const children = [...container.children];
    if (index >= 0) children[index] = node;
    else children.push(node);
    return { ...container, children };
  });
}

export function removeItem(diff: RibbonNode, kind: ItemKind, id: string): RibbonNode {
  const { path, item } = SECTIONS[kind];
  if (!findItem(diff, kind, id)) return diff;
  return updateSection(diff, path, (container) => ({
    ...container,
    children: container.children.filter((entry) => !(entry.name === item && itemKey(kind, entry) === id)),
  }));
}

/** The control a custom action adds (the one element inside CommandUIDefinition). */
export function actionControl(action: RibbonNode): RibbonNode | null {
  return elements(child(action, "CommandUIDefinition"))[0] ?? null;
}

export function withActionControl(action: RibbonNode, control: RibbonNode): RibbonNode {
  return {
    ...action,
    children: action.children.map((item) =>
      item.name === "CommandUIDefinition" ? { ...item, children: [control] } : item,
    ),
  };
}

/** Changed items between the loaded and the current diff: added, removed, or different. */
export function countChanges(loaded: RibbonNode | null | undefined, current: RibbonNode | null | undefined): number {
  if (canonical(loaded) === canonical(current)) return 0;
  let count = 0;
  for (const kind of ITEM_KINDS) {
    const before = new Map(items(loaded, kind).map((node) => [itemKey(kind, node), canonical(node)]));
    const after = new Map(items(current, kind).map((node) => [itemKey(kind, node), canonical(node)]));
    for (const [id, text] of after) if (before.get(id) !== text) count += 1;
    for (const id of before.keys()) if (!after.has(id)) count += 1;
  }
  // Something outside the known items changed (for example Templates). Count it once.
  return Math.max(count, 1);
}

/** Every id the diff defines, for making new ids unique. */
export function definedIds(diff: RibbonNode | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!diff) return ids;
  const walk = (node: RibbonNode) => {
    for (const key of ["Id", "HideActionId"]) {
      const value = node.attributes[key];
      if (value) ids.add(value);
    }
    node.children.forEach(walk);
  };
  walk(diff);
  return ids;
}

/** Replaces attribute values equal to `from` in the named attributes anywhere in the diff. */
export function renameReferences(
  diff: RibbonNode,
  attributeNames: readonly string[],
  from: string,
  to: string,
  only?: (node: RibbonNode) => boolean,
): RibbonNode {
  const walk = (node: RibbonNode): RibbonNode => {
    let attributes = node.attributes;
    if (!only || only(node)) {
      for (const name of attributeNames) {
        if (attributes[name] === from) attributes = { ...attributes, [name]: to };
      }
    }
    const children = node.children.map(walk);
    const changed = attributes !== node.attributes || children.some((item, index) => item !== node.children[index]);
    return changed ? { ...node, attributes, children } : node;
  };
  return walk(diff);
}
