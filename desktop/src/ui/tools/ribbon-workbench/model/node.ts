import type { RibbonNode } from "./types";

export const COMMENT = "#comment";

export function el(
  name: string,
  attributes: Record<string, string> = {},
  children: RibbonNode[] = [],
): RibbonNode {
  return { name, attributes, children };
}

export function attr(node: RibbonNode | null | undefined, name: string): string | null {
  return node?.attributes[name] ?? null;
}

/** A copy with the attribute set, or removed when the value is null or empty. */
export function withAttr(node: RibbonNode, name: string, value: string | null): RibbonNode {
  const attributes = { ...node.attributes };
  if (value === null || value === "") delete attributes[name];
  else attributes[name] = value;
  return { ...node, attributes };
}

/** Child elements, leaving out comments. */
export function elements(node: RibbonNode | null | undefined): RibbonNode[] {
  return node ? node.children.filter((child) => child.name !== COMMENT) : [];
}

export function child(node: RibbonNode | null | undefined, name: string): RibbonNode | null {
  return node?.children.find((item) => item.name === name) ?? null;
}

export function childrenNamed(node: RibbonNode | null | undefined, name: string): RibbonNode[] {
  return node ? node.children.filter((item) => item.name === name) : [];
}

export function descendants(node: RibbonNode): RibbonNode[] {
  const result: RibbonNode[] = [];
  const walk = (current: RibbonNode) => {
    for (const item of current.children) {
      if (item.name === COMMENT) continue;
      result.push(item);
      walk(item);
    }
  };
  walk(node);
  return result;
}

/** Index path from the root to the first node that matches, or null. */
export function findPath(root: RibbonNode, match: (node: RibbonNode) => boolean): number[] | null {
  const walk = (node: RibbonNode, path: number[]): number[] | null => {
    for (let index = 0; index < node.children.length; index += 1) {
      const item = node.children[index]!;
      if (item.name === COMMENT) continue;
      const next = [...path, index];
      if (match(item)) return next;
      const found = walk(item, next);
      if (found) return found;
    }
    return null;
  };
  return walk(root, []);
}

export function nodeAt(root: RibbonNode, path: readonly number[]): RibbonNode | null {
  let current: RibbonNode | undefined = root;
  for (const index of path) {
    current = current?.children[index];
    if (!current) return null;
  }
  return current ?? null;
}

/** A copy of the tree with the node at the path replaced, or removed when the result is null. */
export function updateAt(
  root: RibbonNode,
  path: readonly number[],
  update: (node: RibbonNode) => RibbonNode | null,
): RibbonNode {
  if (path.length === 0) return update(root) ?? root;
  const [index, ...rest] = path as [number, ...number[]];
  const target = root.children[index];
  if (!target) return root;
  const next = rest.length === 0 ? update(target) : updateAt(target, rest, update);
  const children = [...root.children];
  if (next === null) children.splice(index, 1);
  else children[index] = next;
  return { ...root, children };
}

/** Stable text for comparing nodes: comments are left out and attributes are sorted. */
export function canonical(node: RibbonNode | null | undefined): string {
  if (!node) return "";
  if (node.name === COMMENT) return "";
  const attributes = Object.keys(node.attributes)
    .sort()
    .map((key) => ` ${key}="${node.attributes[key]}"`)
    .join("");
  const text = node.text?.trim() ?? "";
  return `<${node.name}${attributes}>${text}${node.children.map(canonical).join("")}</${node.name}>`;
}

export function sameNode(left: RibbonNode | null | undefined, right: RibbonNode | null | undefined): boolean {
  return canonical(left) === canonical(right);
}
