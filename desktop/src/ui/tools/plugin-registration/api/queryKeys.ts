export const registrationKeys = {
  all: (connectionId: string) => ["plugin-registration", connectionId] as const,
  catalog: (connectionId: string) =>
    ["plugin-registration", connectionId, "catalog"] as const,
  stepOptions: (connectionId: string) =>
    ["plugin-registration", connectionId, "step-options"] as const,
  capabilities: (connectionId: string) =>
    ["plugin-registration", connectionId, "capabilities"] as const,
  entityAttributes: (connectionId: string, logicalName: string) =>
    ["plugin-registration", connectionId, "attributes", logicalName] as const,
};
