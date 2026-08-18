import { createContext } from "react";

import type { EntityInfo } from "./model/types";

export interface MetadataExplorerContextValue {
  connectionName: string | null;
  tables: EntityInfo[];
}

export interface MetadataExplorerProviderProps extends MetadataExplorerContextValue {
  children: React.ReactNode;
}

export const MetadataExplorerContext = createContext<MetadataExplorerContextValue | null>(null);
