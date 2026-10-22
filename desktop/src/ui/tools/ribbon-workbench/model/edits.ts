import type { BarNode } from "./commandBar";
import { LOC_LABELS } from "./commandBar";
import {
  actionControl,
  definedIds,
  findItem,
  items,
  removeItem,
  renameReferences,
  setItem,
  withActionControl,
  type ItemKind,
} from "./diff";
import { attr, child, el, findPath, nodeAt, updateAt } from "./node";
import type { RibbonNode } from "./types";

export type AddKind = "button" | "flyout" | "splitButton" | "menuSection" | "group";

export interface IdContext {
  /** Publisher prefix, such as new. */
  prefix: string;
  /** Table logical name, or ApplicationRibbon. */
  scope: string;
  /** Ids already used in the published ribbon. */
  taken: ReadonlySet<string>;
}

const KIND_NAMES: Record<AddKind | "command" | "enableRule" | "displayRule" | "label" | "hide", string> = {
  button: "Button",
  flyout: "Flyout",
  splitButton: "SplitButton",
  menuSection: "MenuSection",
  group: "Group",
  command: "Command",
  enableRule: "EnableRule",
  displayRule: "DisplayRule",
  label: "Label",
  hide: "Hide",
};

/** A new id with the publisher prefix, unique in the diff and the published ribbon. */
export function newId(diff: RibbonNode, context: IdContext, kind: keyof typeof KIND_NAMES): string {
  const used = definedIds(diff);
  const base = `${context.prefix}.${context.scope}.${KIND_NAMES[kind]}`;
  for (let index = 1; ; index += 1) {
    const id = `${base}${index}`;
    if (!used.has(id) && !context.taken.has(id) && !used.has(`${id}.CustomAction`)) return id;
  }
}

function nextSequence(parent: BarNode): number {
  const highest = parent.children.reduce((max, item) => Math.max(max, item.sequence ?? 0), 0);
  return highest + 10;
}

function controlFor(kind: AddKind, id: string, sequence: number, inGroup: boolean, template: string | null): RibbonNode {
  const alias: Record<string, string> = inGroup ? { TemplateAlias: "o1" } : {};
  const menu = (owner: string) =>
    el("Menu", { Id: `${owner}.Menu` }, [
      el("MenuSection", { Id: `${owner}.MenuSection`, Sequence: "10", DisplayMode: "Menu16" }, [
        el("Controls", { Id: `${owner}.MenuSection.Controls` }),
      ]),
    ]);
  switch (kind) {
    case "button":
      return el("Button", { Id: id, Sequence: String(sequence), LabelText: "New button", ...alias });
    case "flyout":
      return el(
        "FlyoutAnchor",
        { Id: id, Sequence: String(sequence), LabelText: "New flyout", PopulateDynamically: "false", ...alias },
        [menu(id)],
      );
    case "splitButton":
      return el("SplitButton", { Id: id, Sequence: String(sequence), LabelText: "New split button", ...alias }, [menu(id)]);
    case "menuSection":
      return el("MenuSection", { Id: id, Sequence: String(sequence), Title: "New section", DisplayMode: "Menu16" }, [
        el("Controls", { Id: `${id}.Controls` }),
      ]);
    case "group":
      return el(
        "Group",
        { Id: id, Sequence: String(sequence), Title: "New group", ...(template ? { Template: template } : {}) },
        [el("Controls", { Id: `${id}.Controls` })],
      );
  }
}

/** Path to the element with this Id inside the diff's custom actions. */
function customPath(diff: RibbonNode, id: string): number[] | null {
  const actionsIndex = diff.children.findIndex((item) => item.name === "CustomActions");
  if (actionsIndex < 0) return null;
  const path = findPath(diff.children[actionsIndex]!, (node) => node.name !== "CustomAction" && attr(node, "Id") === id);
  return path ? [actionsIndex, ...path] : null;
}

export interface AddOptions {
  /** The tab the parent is in; needed for a group's scaling entry. */
  tabId: string | null;
  /** For a group: the template and the layout for its MaxSize entry. */
  template: string | null;
  layout: string | null;
}

/**
 * Adds a control under `parent`. Inside a control the solution adds, the new control goes into that
 * control's definition; otherwise a new custom action targets the parent's container.
 */
export function addChild(
  diff: RibbonNode,
  parent: BarNode,
  kind: AddKind,
  context: IdContext,
  options: AddOptions,
): { diff: RibbonNode; id: string } {
  if (!parent.containerId) return { diff, id: "" };
  const id = newId(diff, context, kind);
  const sequence = nextSequence(parent);
  const control = controlFor(kind, id, sequence, parent.type === "group", kind === "group" ? options.template : null);

  let next = diff;
  const inline = parent.source === "custom" ? customPath(diff, parent.containerId) : null;
  if (inline) {
    next = updateAt(diff, inline, (container) => ({ ...container, children: [...container.children, control] }));
  } else {
    next = setItem(
      diff,
      "customAction",
      el("CustomAction", { Id: `${id}.CustomAction`, Location: `${parent.containerId}._children`, Sequence: String(sequence) }, [
        el("CommandUIDefinition", {}, [control]),
      ]),
    );
  }

  if (kind === "group" && options.tabId && options.layout) {
    next = setGroupLayout(next, id, options.tabId, options.layout, sequence);
  }
  return { diff: next, id };
}

/** Hides a published element with a HideCustomAction. */
export function hide(diff: RibbonNode, targetId: string, context: IdContext): RibbonNode {
  if (items(diff, "hideAction").some((action) => attr(action, "Location") === targetId)) return diff;
  const used = definedIds(diff);
  let hideId = `${targetId}.Hide`;
  if (!hideId.toLowerCase().startsWith(`${context.prefix.toLowerCase()}.`)) hideId = `${context.prefix}.${hideId}`;
  for (let index = 2; used.has(hideId); index += 1) hideId = `${context.prefix}.${targetId}.Hide${index}`;
  return setItem(diff, "hideAction", el("HideCustomAction", { HideActionId: hideId, Location: targetId }));
}

/** Removes every hide action for the element. */
export function show(diff: RibbonNode, targetId: string): RibbonNode {
  let next = diff;
  for (const action of items(diff, "hideAction")) {
    if (attr(action, "Location") === targetId) next = removeItem(next, "hideAction", attr(action, "HideActionId") ?? "");
  }
  return next;
}

/** Deletes a control this solution adds, with a group's scaling entry. */
export function deleteCustom(diff: RibbonNode, node: BarNode): RibbonNode {
  let next = diff;
  if (node.customActionId) {
    next = removeItem(next, "customAction", node.customActionId);
  } else {
    const path = customPath(diff, node.id);
    if (path) next = updateAt(diff, path, () => null);
  }
  if (node.type === "group") {
    for (const action of items(next, "customAction")) {
      if (attr(actionControl(action), "GroupId") === node.id) next = removeItem(next, "customAction", attr(action, "Id") ?? "");
    }
  }
  return next;
}

/** The control element this solution defines for the id, or null. */
export function customControl(diff: RibbonNode, id: string): RibbonNode | null {
  const path = customPath(diff, id);
  return path ? nodeAt(diff, path) : null;
}

export function updateControl(diff: RibbonNode, id: string, control: RibbonNode): RibbonNode {
  const path = customPath(diff, id);
  if (!path) return diff;
  let next = updateAt(diff, path, () => control);
  const newId = attr(control, "Id");
  if (newId && newId !== id) {
    // Keep a group's scaling entry pointing at the group.
    next = renameReferences(next, ["GroupId"], id, newId, (node) => node.name === "MaxSize" || node.name === "Scale");
  }
  return next;
}

function maxSizeAction(diff: RibbonNode, groupId: string): RibbonNode | null {
  return (
    items(diff, "customAction").find((action) => {
      const control = actionControl(action);
      return control?.name === "MaxSize" && attr(control, "GroupId") === groupId;
    }) ?? null
  );
}

export function groupLayout(diff: RibbonNode, groupId: string): string | null {
  const action = maxSizeAction(diff, groupId);
  return action ? attr(actionControl(action), "Size") : null;
}

/** Sets the layout of a group this solution adds, through its MaxSize scaling entry. */
export function setGroupLayout(
  diff: RibbonNode,
  groupId: string,
  tabId: string,
  layout: string,
  sequence?: number,
): RibbonNode {
  const existing = maxSizeAction(diff, groupId);
  if (existing) {
    const control = actionControl(existing)!;
    return setItem(diff, "customAction", withActionControl(existing, { ...control, attributes: { ...control.attributes, Size: layout } }));
  }
  const seq = String(sequence ?? 10);
  return setItem(
    diff,
    "customAction",
    el("CustomAction", { Id: `${groupId}.MaxSize.CustomAction`, Location: `${tabId}.Scaling._children`, Sequence: seq }, [
      el("CommandUIDefinition", {}, [el("MaxSize", { Id: `${groupId}.MaxSize`, GroupId: groupId, Sequence: seq, Size: layout })]),
    ]),
  );
}

/** Copies a published command into the solution, so the solution's copy overrides it. Rules are not copied. */
export function customiseCommand(diff: RibbonNode, command: RibbonNode): RibbonNode {
  const id = attr(command, "Id");
  if (!id || findItem(diff, "command", id)) return diff;
  return setItem(diff, "command", structuredClone(command));
}

export function newCommand(id: string): RibbonNode {
  return el("CommandDefinition", { Id: id }, [el("EnableRules"), el("DisplayRules"), el("Actions")]);
}

export function newRule(kind: "enableRule" | "displayRule", id: string): RibbonNode {
  return el(kind === "enableRule" ? "EnableRule" : "DisplayRule", { Id: id });
}

export function newLabel(id: string, lcid = 1033): RibbonNode {
  return el("LocLabel", { Id: id }, [el("Titles", {}, [el("Title", { languagecode: String(lcid), description: "New label" })])]);
}

/** Replaces an item; when its id changed, references to it in the diff follow. */
export function replaceItem(diff: RibbonNode, kind: ItemKind, previousId: string, node: RibbonNode): RibbonNode {
  let next = setItem(diff, kind, node, previousId);
  const id = attr(node, kind === "hideAction" ? "HideActionId" : "Id");
  if (!id || id === previousId) return next;
  switch (kind) {
    case "command":
      next = renameReferences(next, ["Command"], previousId, id);
      break;
    case "enableRule":
      next = renameReferences(next, ["Id"], previousId, id, (item) => item.name === "EnableRule" && item.children.length === 0);
      break;
    case "displayRule":
      next = renameReferences(next, ["Id"], previousId, id, (item) => item.name === "DisplayRule" && item.children.length === 0);
      break;
    case "label":
      next = renameLabelReferences(next, previousId, id);
      break;
    default:
      break;
  }
  return next;
}

function renameLabelReferences(diff: RibbonNode, from: string, to: string): RibbonNode {
  const walk = (node: RibbonNode): RibbonNode => {
    let attributes = node.attributes;
    for (const [name, value] of Object.entries(node.attributes)) {
      if (value === `${LOC_LABELS}${from}`) attributes = { ...attributes, [name]: `${LOC_LABELS}${to}` };
    }
    const children = node.children.map(walk);
    const changed = attributes !== node.attributes || children.some((item, index) => item !== node.children[index]);
    return changed ? { ...node, attributes, children } : node;
  };
  return walk(diff);
}

/** Rule ids a command references. */
export function ruleReferences(command: RibbonNode | null): { enable: string[]; display: string[] } {
  const ids = (container: string, item: string) =>
    (child(command, container)?.children ?? [])
      .filter((node) => node.name === item)
      .map((node) => attr(node, "Id") ?? "")
      .filter((id) => id.length > 0);
  return { enable: ids("EnableRules", "EnableRule"), display: ids("DisplayRules", "DisplayRule") };
}

/** Commands that reference the rule. */
export function usedBy(commands: readonly RibbonNode[], kind: "enableRule" | "displayRule", ruleId: string): string[] {
  return commands
    .filter((command) => ruleReferences(command)[kind === "enableRule" ? "enable" : "display"].includes(ruleId))
    .map((command) => attr(command, "Id") ?? "");
}
