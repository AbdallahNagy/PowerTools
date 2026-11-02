export const environmentVariablesKeys = {
  all: (connectionId: string) => ["environment-variables-manager", connectionId] as const,
  list: (connectionId: string) => ["environment-variables-manager", connectionId, "list"] as const,
  solutions: (connectionId: string) => ["environment-variables-manager", connectionId, "solutions"] as const,
};
