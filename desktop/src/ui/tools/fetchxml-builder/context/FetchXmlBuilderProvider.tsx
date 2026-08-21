import { FetchXmlBuilderContext, type FetchXmlBuilderProviderProps } from "./FetchXmlBuilderContext";

export function FetchXmlBuilderProvider({
  connectionName,
  tables,
  children,
}: FetchXmlBuilderProviderProps) {
  return (
    <FetchXmlBuilderContext.Provider value={{ connectionName, tables }}>
      {children}
    </FetchXmlBuilderContext.Provider>
  );
}
