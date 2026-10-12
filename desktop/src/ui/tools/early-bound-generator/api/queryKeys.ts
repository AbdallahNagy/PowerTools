export const earlyBoundKeys = {
  tables: (connectionName: string) => ["early-bound-generator", connectionName, "tables"] as const,
};
