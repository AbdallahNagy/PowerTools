export const translatorKeys = {
  languages: (connectionName: string) => ["translator", connectionName, "languages"] as const,
  tables: (connectionName: string) => ["translator", connectionName, "tables"] as const,
  allLabels: (connectionName: string) => ["translator", connectionName, "labels"] as const,
  labels: (connectionName: string, scope: string, tab: string, lcids: readonly number[]) =>
    ["translator", connectionName, "labels", scope, tab, lcids.join(",")] as const,
};
