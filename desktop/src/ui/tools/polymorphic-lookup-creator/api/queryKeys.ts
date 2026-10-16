export const polymorphicKeys = {
  solutions: (connectionId: string) =>
    ["polymorphic-lookup-creator", connectionId, "solutions"] as const,
  metadata: (connectionId: string) =>
    ["polymorphic-lookup-creator", connectionId, "metadata"] as const,
};
