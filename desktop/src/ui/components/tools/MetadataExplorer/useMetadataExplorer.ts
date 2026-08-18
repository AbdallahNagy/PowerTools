import { useContext } from "react";

import { MetadataExplorerContext } from "./MetadataExplorerContext";

export function useMetadataExplorer() {
  const context = useContext(MetadataExplorerContext);
  if (!context) {
    throw new Error("useMetadataExplorer must be used within MetadataExplorerProvider");
  }
  return context;
}
