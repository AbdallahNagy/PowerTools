export const solutionLayersKeys = {
  all: (connectionName: string) => ["solution-layers-explorer", connectionName] as const,
  componentTypes: (connectionName: string) =>
    ["solution-layers-explorer", connectionName, "component-types"] as const,
  tables: (connectionName: string) => ["solution-layers-explorer", connectionName, "tables"] as const,
  components: (connectionName: string, componentType: number, search: string, entity: string) =>
    ["solution-layers-explorer", connectionName, "components", componentType, search, entity] as const,
  layers: (connectionName: string, componentType: number, componentId: string) =>
    ["solution-layers-explorer", connectionName, "layers", componentType, componentId] as const,
};
