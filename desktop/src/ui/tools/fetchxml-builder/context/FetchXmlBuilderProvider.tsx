import { FetchXmlBuilderContext, type FetchXmlBuilderProviderProps } from "./FetchXmlBuilderContext";

export function FetchXmlBuilderProvider({
  connectionId,
  tables,
  children,
}: FetchXmlBuilderProviderProps) {
  return (
    <FetchXmlBuilderContext.Provider value={{ connectionId, tables }}>
      {children}
    </FetchXmlBuilderContext.Provider>
  );
}
