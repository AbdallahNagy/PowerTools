/** Source "" is All tables; otherwise a solution id. */
export const translatorKeys = {
  languages: (connectionName: string) => ["translator", connectionName, "languages"] as const,
  solutions: (connectionName: string) => ["translator", connectionName, "solutions"] as const,
  publishers: (connectionName: string) => ["translator", connectionName, "publishers"] as const,
  tables: (connectionName: string, source: string) => ["translator", connectionName, "tables", source] as const,
  allLabels: (connectionName: string) => ["translator", connectionName, "labels"] as const,
  labels: (connectionName: string, source: string, scope: string, tab: string, lcids: readonly number[]) =>
    ["translator", connectionName, "labels", source, scope, tab, lcids.join(",")] as const,
};
