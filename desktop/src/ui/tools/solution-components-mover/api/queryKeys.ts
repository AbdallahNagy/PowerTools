export const solutionComponentKeys = {
  solutions: (connectionName: string) =>
    ["solution-components-mover", connectionName, "solutions"] as const,
  types: (connectionName: string) =>
    ["solution-components-mover", connectionName, "component-types"] as const,
};
