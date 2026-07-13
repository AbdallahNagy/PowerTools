import type { EntityInfo } from "./types";

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildLookupFetchXml(entity: EntityInfo, search: string): string {
  const attrs =
    `<attribute name="${esc(entity.primaryIdAttribute)}" />` +
    `<attribute name="${esc(entity.primaryNameAttribute)}" />` +
    `<attribute name="createdon" />`;
  const order = `<order attribute="createdon" descending="true" />`;
  const trimmed = search.trim();
  const filter = trimmed
    ? `<filter><condition attribute="${esc(entity.primaryNameAttribute)}" operator="like" value="%${esc(trimmed)}%" /></filter>`
    : "";

  return `<fetch><entity name="${esc(entity.logicalName)}">${attrs}${order}${filter}</entity></fetch>`;
}
