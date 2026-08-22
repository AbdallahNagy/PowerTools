import type { EntityInfo } from "../../../shared/contracts/dataverse";

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeGuid(value: string): string | null {
  const unwrapped = value.startsWith("{") && value.endsWith("}")
    ? value.slice(1, -1)
    : value;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(unwrapped)
    ? unwrapped
    : null;
}

export function buildLookupFetchXml(entity: EntityInfo, search: string): string {
  const attrs =
    `<attribute name="${esc(entity.primaryIdAttribute)}" />` +
    `<attribute name="${esc(entity.primaryNameAttribute)}" />` +
    `<attribute name="createdon" />`;
  const order = `<order attribute="createdon" descending="true" />`;
  const trimmed = search.trim();
  const guid = normalizeGuid(trimmed);
  const filter = trimmed
    ? guid
      ? `<filter><condition attribute="${esc(entity.primaryIdAttribute)}" operator="eq" value="${esc(guid)}" /></filter>`
      : `<filter><condition attribute="${esc(entity.primaryNameAttribute)}" operator="like" value="%${esc(trimmed)}%" /></filter>`
    : "";

  return `<fetch><entity name="${esc(entity.logicalName)}">${attrs}${order}${filter}</entity></fetch>`;
}
