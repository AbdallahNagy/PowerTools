export const solutionComponentKeys = {
  solutions: (connectionId: string) =>
    ["solution-components-mover", connectionId, "solutions"] as const,
  types: (connectionId: string) =>
    ["solution-components-mover", connectionId, "component-types"] as const,
};
