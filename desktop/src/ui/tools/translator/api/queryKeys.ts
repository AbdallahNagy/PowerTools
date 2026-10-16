/** Source "" is All tables; otherwise a solution id. */
export const translatorKeys = {
  languages: (connectionId: string) => ["translator", connectionId, "languages"] as const,
  solutions: (connectionId: string) => ["translator", connectionId, "solutions"] as const,
  publishers: (connectionId: string) => ["translator", connectionId, "publishers"] as const,
  tables: (connectionId: string, source: string) => ["translator", connectionId, "tables", source] as const,
  allLabels: (connectionId: string) => ["translator", connectionId, "labels"] as const,
  labels: (connectionId: string, source: string, scope: string, tab: string, lcids: readonly number[]) =>
    ["translator", connectionId, "labels", source, scope, tab, lcids.join(",")] as const,
};
