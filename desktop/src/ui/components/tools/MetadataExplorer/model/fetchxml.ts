import type { FieldReference, FilterCondition, FilterGroup, FilterNode, RelationshipPathSegment } from "./types.ts";
import { NO_VALUE_OPERATORS, MULTI_VALUE_OPERATORS } from "./operators.ts";

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getFieldReference(condition: FilterCondition): FieldReference | null {
  if (condition.fieldRef) return condition.fieldRef;
  if (condition.field) return { kind: "root", field: condition.field };
  return null;
}

export function getConditionScope(condition: FilterCondition): string {
  const ref = getFieldReference(condition);
  if (!ref || ref.kind === "root") return "root";
  return ref.path.map((segment) => segment.alias).join("/");
}

function getConditionAttribute(c: FilterCondition): string | null {
  const ref = getFieldReference(c);
  return ref?.field ?? null;
}

function renderCondition(c: FilterCondition): string {
  const field = getConditionAttribute(c);
  if (!field || !c.operator) return "";

  const attr = `attribute="${esc(field)}"`;

  if (NO_VALUE_OPERATORS.includes(c.operator)) {
    return `<condition ${attr} operator="${c.operator}" />`;
  }

  if (MULTI_VALUE_OPERATORS.includes(c.operator)) {
    const values = (c.value as string[] | undefined ?? [])
      .map((v) => `<value>${esc(v)}</value>`)
      .join("");
    return `<condition ${attr} operator="${c.operator}">${values}</condition>`;
  }

  let op = c.operator;
  let val = (c.value as string | undefined) ?? "";

  if (op === "like") val = `%${val}%`;
  else if (op === "not-like") val = `%${val}%`;
  else if (op === "begins-with") { op = "like"; val = `${val}%`; }
  else if (op === "ends-with")   { op = "like"; val = `%${val}`; }

  return `<condition ${attr} operator="${op}" value="${esc(val)}" />`;
}

function renderGroup(g: FilterGroup, scope = "root"): string {
  if (!g.children.length) return "";
  const inner = g.children
    .map((n) => renderNode(n, scope))
    .join("");
  if (!inner) return "";
  return `<filter type="${g.logic}">${inner}</filter>`;
}

function renderNode(n: FilterNode, scope: string): string {
  if (n.kind === "group") return renderGroup(n, scope);
  return getConditionScope(n) === scope ? renderCondition(n) : "";
}

interface LinkNode {
  segment: RelationshipPathSegment;
  conditions: FilterCondition[];
  logic: "and" | "or";
  children: Map<string, LinkNode>;
}

function relatedPathKey(condition: FilterCondition): string | null {
  const ref = getFieldReference(condition);
  if (!ref || ref.kind !== "related" || ref.path.length === 0) return null;
  return ref.path.map((segment) => segment.alias).join("/");
}

function collectRelatedLinks(root: FilterGroup): Map<string, LinkNode> {
  const links = new Map<string, LinkNode>();

  function ensureLink(path: RelationshipPathSegment[]): LinkNode | null {
    let level = links;
    let current: LinkNode | null = null;
    for (const segment of path) {
      const key = segment.alias;
      let next = level.get(key);
      if (!next) {
        next = { segment, conditions: [], logic: "and", children: new Map() };
        level.set(key, next);
      }
      current = next;
      level = next.children;
    }
    return current;
  }

  function walk(node: FilterNode) {
    if (node.kind === "group") {
      const directConditions = node.children.filter((child): child is FilterCondition => child.kind === "condition");
      const directPathKeys = new Set(directConditions.map(relatedPathKey).filter((key): key is string => !!key));
      if (directConditions.length === node.children.length && directPathKeys.size === 1) {
        const first = directConditions[0];
        const ref = first ? getFieldReference(first) : null;
        if (ref?.kind === "related") {
          const link = ensureLink(ref.path);
          if (link) {
            link.logic = node.logic;
            link.conditions.push(...directConditions);
          }
          return;
        }
      }
      for (const child of node.children) walk(child);
      return;
    }

    const ref = getFieldReference(node);
    if (!ref || ref.kind !== "related" || ref.path.length === 0) return;

    const link = ensureLink(ref.path);
    link?.conditions.push(node);
  }

  walk(root);
  return links;
}

function renderLinks(links: Map<string, LinkNode>, parentPath: RelationshipPathSegment[] = []): string {
  return [...links.values()]
    .map((link) => {
      const path = [...parentPath, link.segment];
      const filter = link.conditions.length
        ? `<filter type="${link.logic}">${link.conditions.map(renderCondition).join("")}</filter>`
        : "";
      const children = renderLinks(link.children, path);
      return (
        `<link-entity name="${esc(link.segment.targetEntity)}"` +
        ` from="${esc(link.segment.linkFromAttribute)}"` +
        ` to="${esc(link.segment.linkToAttribute)}"` +
        ` alias="${esc(link.segment.alias)}"` +
        ` link-type="inner">` +
        filter +
        children +
        `</link-entity>`
      );
    })
    .join("");
}

export function buildFetchXml(
  entityLogicalName: string,
  root: FilterGroup,
  attributes: string[] = []
): string {
  const attrs = attributes.length
    ? attributes.map((a) => `<attribute name="${esc(a)}" />`).join("")
    : "";
  const filter = renderGroup(root);
  const links = renderLinks(collectRelatedLinks(root));
  return `<fetch><entity name="${esc(entityLogicalName)}">${attrs}${filter}${links}</entity></fetch>`;
}
