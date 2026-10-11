export const recycleBinKeys = {
  all: (connectionName: string) => ["recycle-bin", connectionName] as const,
  status: (connectionName: string) => ["recycle-bin", connectionName, "status"] as const,
  tables: (connectionName: string) => ["recycle-bin", connectionName, "tables"] as const,
  users: (connectionName: string) => ["recycle-bin", connectionName, "users"] as const,
  deleted: (connectionName: string, searchId: number) =>
    ["recycle-bin", connectionName, "deleted", searchId] as const,
  record: (connectionName: string, source: string, table: string, key: string) =>
    ["recycle-bin", connectionName, "record", source, table, key] as const,
  attributes: (connectionName: string, table: string) =>
    ["recycle-bin", connectionName, "attributes", table] as const,
};
