import { createContext } from "react";

import type { EntityInfo } from "../../../shared/contracts/dataverse";

export interface FetchXmlBuilderContextValue {
  connectionId: string | null;
  tables: EntityInfo[];
}

export interface FetchXmlBuilderProviderProps extends FetchXmlBuilderContextValue {
  children: React.ReactNode;
}

export const FetchXmlBuilderContext = createContext<FetchXmlBuilderContextValue | null>(null);
