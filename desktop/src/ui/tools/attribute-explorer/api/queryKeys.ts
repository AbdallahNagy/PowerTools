export const attributeExplorerKeys = {
  tables: (connectionId: string) =>
    ["attribute-explorer", connectionId, "tables"] as const,
  allAttributes: (connectionId: string) =>
    ["attribute-explorer", connectionId, "attributes"] as const,
  attributes: (connectionId: string, logicalName: string) =>
    ["attribute-explorer", connectionId, "attributes", logicalName] as const,
};
