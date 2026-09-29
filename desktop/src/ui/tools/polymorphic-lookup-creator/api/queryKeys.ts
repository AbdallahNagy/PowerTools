export const polymorphicKeys = {
  solutions: (connectionName: string) =>
    ["polymorphic-lookup-creator", connectionName, "solutions"] as const,
  metadata: (connectionName: string) =>
    ["polymorphic-lookup-creator", connectionName, "metadata"] as const,
};
