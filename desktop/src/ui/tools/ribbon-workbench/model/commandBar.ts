import { actionControl, items } from "./diff";
import { attr, child, elements } from "./node";
import type { RibbonNode } from "./types";

export type BarNodeType = "tab" | "group" | "button" | "flyout" | "splitButton" | "menuSection" | "control";

export interface BarNode {
  id: string;
  tag: string;
  type: BarNodeType;
  /** Raw LabelText or Title; resolve with {@link labelText}. */
  label: string | null;
  command: string | null;
  sequence: number | null;
  children: BarNode[];
  /** custom: added by this solution's diff. */
  source: "base" | "custom";
  hidden: boolean;
  /** A base control whose command this solution redefines. */
  commandCustomised: boolean;
  /** Id of the element new children go into (Groups, Controls, or Menu), when there is one. */
  containerId: string | null;
  /** The custom action that adds this node, when the node is the control the action defines. */
  customActionId: string | null;
  element: RibbonNode;
}

export interface CommandBar {
  tabs: BarNode[];
  /** Hide actions whose target is not in the published ribbon (already hidden there). */
  hiddenElsewhere: RibbonNode[];
}

export interface LocationOption {
  value: string;
  label: string;
}

export const TABLE_LOCATIONS: LocationOption[] = [
  { value: "Form", label: "Form" },
  { value: "HomepageGrid", label: "Home grid" },
  { value: "SubGrid", label: "Subgrid" },
];

const LOCATION_LABELS: Record<string, string> = {
  Form: "Form",
  HomepageGrid: "Home grid",
  SubGrid: "Subgrid",
  BasicHomeTab: "Home",
  DashboardTab: "Dashboard",
  Dashboard: "Dashboard",
  Jewel: "File menu",
  GlobalTab: "Global",
};

/** The location a tab belongs to: the segment after "Mscrm.", such as HomepageGrid. */
export function tabLocation(tabId: string): string {
  const parts = tabId.split(".");
  return parts[0] === "Mscrm" && parts.length > 1 ? parts[1]! : parts[0]!;
}

/** Locations for the application ribbon, taken from its tabs. */
export function applicationLocations(tabs: readonly RibbonNode[]): LocationOption[] {
  const seen = new Map<string, string>();
  for (const tab of tabs) {
    const id = attr(tab, "Id");
    if (!id) continue;
    const location = tabLocation(id);
    if (!seen.has(location)) seen.set(location, LOCATION_LABELS[location] ?? location);
  }
  return [...seen].map(([value, label]) => ({ value, label }));
}

function typeOf(tag: string): BarNodeType {
  switch (tag) {
    case "Tab":
      return "tab";
    case "Group":
      return "group";
    case "Button":
    case "ToggleButton":
      return "button";
    case "FlyoutAnchor":
      return "flyout";
    case "SplitButton":
    case "MRUSplitButton":
      return "splitButton";
    case "MenuSection":
      return "menuSection";
    default:
      return "control";
  }
}

function sequenceOf(node: RibbonNode): number | null {
  const value = Number.parseInt(attr(node, "Sequence") ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

function bySequence(nodes: BarNode[]): BarNode[] {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((left, right) => {
      const a = left.node.sequence ?? Number.MAX_SAFE_INTEGER;
      const b = right.node.sequence ?? Number.MAX_SAFE_INTEGER;
      return a === b ? left.index - right.index : a - b;
    })
    .map(({ node }) => node);
}

/** The element whose children are this node's children in the tree, and their container id. */
function childContainer(element: RibbonNode): { container: RibbonNode | null; items: RibbonNode[] } {
  switch (element.name) {
    case "Tab": {
      const groups = child(element, "Groups");
      return { container: groups, items: elements(groups) };
    }
    case "Group":
    case "MenuSection": {
      const controls = child(element, "Controls");
      return { container: controls, items: elements(controls) };
    }
    default: {
      const menu = child(element, "Menu");
      return { container: menu, items: elements(menu) };
    }
  }
}

function convert(
  element: RibbonNode,
  source: "base" | "custom",
  customActionId: string | null,
  strip: ReadonlySet<string>,
  containers: Map<string, BarNode>,
): BarNode | null {
  const id = attr(element, "Id");
  if (!id) return null;
  const { container, items: childItems } = childContainer(element);
  const node: BarNode = {
    id,
    tag: element.name,
    type: typeOf(element.name),
    label: attr(element, "LabelText") ?? attr(element, "Title") ?? attr(element, "Alt"),
    command: attr(element, "Command"),
    sequence: sequenceOf(element),
    children: [],
    source,
    hidden: false,
    commandCustomised: false,
    containerId: attr(container, "Id"),
    customActionId,
    element,
  };
  if (node.containerId) containers.set(node.containerId, node);
  node.children = childItems
    .filter((item) => source === "custom" || !strip.has(attr(item, "Id") ?? ""))
    .map((item) => convert(item, source, null, strip, containers))
    .filter((item): item is BarNode => item !== null);
  return node;
}

function sortTree(nodes: BarNode[]): BarNode[] {
  return bySequence(nodes).map((node) => ({ ...node, children: sortTree(node.children) }));
}

function visit(nodes: BarNode[], action: (node: BarNode) => void) {
  for (const node of nodes) {
    action(node);
    visit(node.children, action);
  }
}

/**
 * The command bar the editor shows for one location: the published ribbon, with this solution's custom
 * actions put in place by id. The published ribbon already contains the loaded diff, so controls that the
 * loaded or the current diff adds are removed from it first and the current ones inserted again. That keeps
 * a custom button from showing twice and makes a deleted one disappear before publishing.
 */
export function buildCommandBar(
  baseTabs: readonly RibbonNode[],
  loadedDiff: RibbonNode | null,
  currentDiff: RibbonNode | null,
  location: string | null,
): CommandBar {
  const strip = new Set<string>();
  for (const diff of [loadedDiff, currentDiff]) {
    for (const action of items(diff, "customAction")) {
      const id = attr(actionControl(action), "Id");
      if (id) strip.add(id);
    }
  }

  const containers = new Map<string, BarNode>();
  const tabs = baseTabs
    .filter((tab) => {
      const id = attr(tab, "Id") ?? "";
      return !strip.has(id) && (location === null || tabLocation(id) === location);
    })
    .map((tab) => convert(tab, "base", null, strip, containers))
    .filter((tab): tab is BarNode => tab !== null);

  // A custom action may target a container another custom action adds, so place them until nothing changes.
  let pending = items(currentDiff, "customAction");
  let placed = true;
  while (pending.length > 0 && placed) {
    placed = false;
    const next: RibbonNode[] = [];
    for (const action of pending) {
      const control = actionControl(action);
      // Scaling entries (MaxSize, Scale) and templates are not part of the tree.
      if (!control || !isControl(control)) continue;
      const target = (attr(action, "Location") ?? "").replace(/\._children$/, "");
      // A tab added by the solution goes at the top level when it belongs to this location.
      if (control.name === "Tab") {
        const tabId = attr(control, "Id") ?? "";
        if (location === null || tabLocation(tabId) === location) {
          const node = convert(control, "custom", attr(action, "Id"), strip, containers);
          if (node) {
            tabs.push(node);
            placed = true;
          }
        }
        continue;
      }
      const parent = containers.get(target);
      if (!parent) {
        next.push(action);
        continue;
      }
      const node = convert(control, "custom", attr(action, "Id"), strip, containers);
      if (node) {
        if (node.sequence === null) node.sequence = sequenceOf(action);
        parent.children.push(node);
        placed = true;
      }
    }
    pending = next;
  }

  const commandIds = new Set(items(currentDiff, "command").map((command) => attr(command, "Id") ?? ""));
  const hides = items(currentDiff, "hideAction");
  const hiddenIds = new Set(hides.map((hide) => attr(hide, "Location") ?? ""));
  const sorted = sortTree(tabs);
  const found = new Set<string>();
  visit(sorted, (node) => {
    if (hiddenIds.has(node.id)) {
      node.hidden = true;
      found.add(node.id);
    }
    if (node.source === "base" && node.command && commandIds.has(node.command)) node.commandCustomised = true;
  });

  return {
    tabs: sorted,
    hiddenElsewhere: hides.filter((hide) => !found.has(attr(hide, "Location") ?? "")),
  };
}

function isControl(node: RibbonNode): boolean {
  return attr(node, "Id") !== null && !["MaxSize", "Scale", "GroupTemplate", "Layout"].includes(node.name);
}

export function findBarNode(tabs: readonly BarNode[], id: string): BarNode | null {
  for (const node of tabs) {
    if (node.id === id) return node;
    const found = findBarNode(node.children, id);
    if (found) return found;
  }
  return null;
}

/** The tab a node belongs to. */
export function tabOf(tabs: readonly BarNode[], id: string): BarNode | null {
  return tabs.find((tab) => tab.id === id || findBarNode(tab.children, id) !== null) ?? null;
}

/** Ids of every control in the tree, for making new ids unique. */
export function barIds(tabs: readonly BarNode[]): Set<string> {
  const ids = new Set<string>();
  visit([...tabs], (node) => {
    ids.add(node.id);
    if (node.containerId) ids.add(node.containerId);
  });
  return ids;
}

/** Commands that base (not custom) controls use. */
export function baseCommandIds(tabs: readonly BarNode[]): Set<string> {
  const ids = new Set<string>();
  visit([...tabs], (node) => {
    if (node.source === "base" && node.command) ids.add(node.command);
  });
  return ids;
}

export const LOC_LABELS = "$LocLabels:";

/**
 * Text for a LabelText or Title value. A $LocLabels reference shows the label's text; a $Resources
 * reference cannot be read here and returns null so the caller shows the id.
 */
export function labelText(value: string | null, labels: ReadonlyMap<string, string>): string | null {
  if (!value) return null;
  if (value.startsWith(LOC_LABELS)) return labels.get(value.slice(LOC_LABELS.length)) ?? null;
  if (value.startsWith("$Resources")) return null;
  return value;
}

/** Label id to its text, preferring the given language, then English, then the first one. */
export function labelMap(labels: readonly RibbonNode[], lcid = 1033): Map<string, string> {
  const map = new Map<string, string>();
  for (const label of labels) {
    const id = attr(label, "Id");
    if (!id) continue;
    const titles = elements(child(label, "Titles"));
    const title =
      titles.find((item) => attr(item, "languagecode") === String(lcid)) ??
      titles.find((item) => attr(item, "languagecode") === "1033") ??
      titles[0];
    const text = attr(title, "description");
    if (text) map.set(id, text);
  }
  return map;
}
