export function suggestSchemaFragment(displayName: string): string {
  const decomposed = displayName.normalize("NFKD").replace(/\p{M}/gu, "");
  const ascii = decomposed.replace(/[^\u0020-\u007E]/g, "");
  const words = ascii.split(/\s+/).filter((word) => word.length > 0);
  const pascal = words
    .map((word) => {
      const cleaned = word.replace(/[^A-Za-z0-9_]/g, "");
      if (!cleaned) return "";
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    })
    .join("");
  if (!pascal) return "";
  return pascal.endsWith("Id") ? pascal : `${pascal}Id`;
}

export function prefixText(customizationPrefix: string): string {
  if (!customizationPrefix) return "";
  return customizationPrefix.endsWith("_") ? customizationPrefix : `${customizationPrefix}_`;
}

export function joinSchema(customizationPrefix: string, fragment: string): string {
  return `${prefixText(customizationPrefix)}${fragment}`;
}

export function splitSchema(schemaName: string): { prefix: string; fragment: string } {
  const index = schemaName.indexOf("_");
  if (index <= 0) return { prefix: "", fragment: schemaName };
  return {
    prefix: schemaName.slice(0, index + 1),
    fragment: schemaName.slice(index + 1),
  };
}

export function isSchemaName(schemaName: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(schemaName);
}

export function matchesQuery(query: string, values: Array<string | null | undefined>): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => (value ?? "").toLowerCase().includes(needle));
}
