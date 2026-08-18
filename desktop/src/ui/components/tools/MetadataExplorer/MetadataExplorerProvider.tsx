import { MetadataExplorerContext, type MetadataExplorerProviderProps } from "./MetadataExplorerContext";

export function MetadataExplorerProvider({
  connectionName,
  tables,
  children,
}: MetadataExplorerProviderProps) {
  return (
    <MetadataExplorerContext.Provider value={{ connectionName, tables }}>
      {children}
    </MetadataExplorerContext.Provider>
  );
}
