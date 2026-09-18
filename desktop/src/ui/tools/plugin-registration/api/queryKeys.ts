export const registrationKeys = {
  all: (connectionName: string) => ["plugin-registration", connectionName] as const,
  catalog: (connectionName: string) =>
    ["plugin-registration", connectionName, "catalog"] as const,
  stepOptions: (connectionName: string) =>
    ["plugin-registration", connectionName, "step-options"] as const,
  capabilities: (connectionName: string) =>
    ["plugin-registration", connectionName, "capabilities"] as const,
  entityAttributes: (connectionName: string, logicalName: string) =>
    ["plugin-registration", connectionName, "attributes", logicalName] as const,
};
