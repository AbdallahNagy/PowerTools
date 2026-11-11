export type FilterOperator = "eq" | "ne" | "like" | "null" | "not-null" | "in";

export interface RetrieveMultipleQuery {
  select?: string[];
  filter?: Array<{ column: string; operator: FilterOperator; value?: unknown }>;
  orderBy?: Array<{ column: string; descending?: boolean }>;
  top?: number;
}

function escapeXml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function condition(column: string, operator: FilterOperator, value: unknown): string {
  const head = `<condition attribute="${escapeXml(column)}" operator="${operator}"`;
  if (operator === "null" || operator === "not-null") return `${head} />`;
  if (operator === "in") {
    const values = Array.isArray(value) ? value : [value];
    return `${head}>${values.map((v) => `<value>${escapeXml(v)}</value>`).join("")}</condition>`;
  }
  return `${head} value="${escapeXml(value)}" />`;
}

/** Builds a FetchXML query from a simple description. All names and values are XML-escaped. */
export function buildFetchXml(table: string, query: RetrieveMultipleQuery): string {
  const parts: string[] = [];
  for (const column of query.select ?? []) parts.push(`<attribute name="${escapeXml(column)}" />`);
  if (query.filter?.length) {
    const conditions = query.filter.map((f) => condition(f.column, f.operator, f.value)).join("");
    parts.push(`<filter type="and">${conditions}</filter>`);
  }
  for (const order of query.orderBy ?? []) {
    parts.push(`<order attribute="${escapeXml(order.column)}" descending="${order.descending ? "true" : "false"}" />`);
  }
  const top = query.top !== undefined ? ` top="${escapeXml(query.top)}"` : "";
  return `<fetch${top}><entity name="${escapeXml(table)}">${parts.join("")}</entity></fetch>`;
}
