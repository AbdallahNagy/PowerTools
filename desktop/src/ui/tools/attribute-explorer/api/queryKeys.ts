export const attributeExplorerKeys = {
  tables: (connectionName: string) =>
    ["attribute-explorer", connectionName, "tables"] as const,
  attributes: (connectionName: string, logicalName: string) =>
    ["attribute-explorer", connectionName, "attributes", logicalName] as const,
};
