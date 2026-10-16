export const solutionLayersKeys = {
  all: (connectionId: string) => ["solution-layers-explorer", connectionId] as const,
  componentTypes: (connectionId: string) =>
    ["solution-layers-explorer", connectionId, "component-types"] as const,
  tables: (connectionId: string) => ["solution-layers-explorer", connectionId, "tables"] as const,
  components: (connectionId: string, componentType: number, search: string, entity: string) =>
    ["solution-layers-explorer", connectionId, "components", componentType, search, entity] as const,
  layers: (connectionId: string, componentType: number, componentId: string) =>
    ["solution-layers-explorer", connectionId, "layers", componentType, componentId] as const,
};
