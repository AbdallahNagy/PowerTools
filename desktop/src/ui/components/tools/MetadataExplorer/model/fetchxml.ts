import type { FilterCondition, FilterGroup, FilterNode } from "./types";
import { NO_VALUE_OPERATORS, MULTI_VALUE_OPERATORS } from "./operators";

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCondition(c: FilterCondition): string {
  if (!c.field || !c.operator) return "";

  const attr = `attribute="${esc(c.field)}"`;

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

function renderGroup(g: FilterGroup): string {
  if (!g.children.length) return "";
  const inner = g.children
    .map((n) => renderNode(n))
    .join("");
  return `<filter type="${g.logic}">${inner}</filter>`;
}

function renderNode(n: FilterNode): string {
  return n.kind === "group" ? renderGroup(n) : renderCondition(n);
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
  return `<fetch><entity name="${esc(entityLogicalName)}">${attrs}${filter}</entity></fetch>`;
}
