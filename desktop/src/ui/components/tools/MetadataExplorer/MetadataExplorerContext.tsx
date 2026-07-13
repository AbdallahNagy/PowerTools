import { createContext, useContext, type ReactNode } from "react";
import type { EntityInfo } from "./model/types";

interface MetadataExplorerContextValue {
  connectionName: string | null;
  tables: EntityInfo[];
}

const MetadataExplorerContext = createContext<MetadataExplorerContextValue | null>(null);

interface MetadataExplorerProviderProps {
  connectionName: string | null;
  tables: EntityInfo[];
  children: ReactNode;
}

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

export function useMetadataExplorer() {
  const context = useContext(MetadataExplorerContext);
  if (!context) {
    throw new Error("useMetadataExplorer must be used within MetadataExplorerProvider");
  }
  return context;
}
