export const earlyBoundGeneratorKeys = {
  tables: (connectionName: string) => ["early-bound-generator", connectionName, "tables"] as const,
  folder: (connectionName: string, path: string) => ["early-bound-generator", connectionName, "folder", path] as const,
};
