import { useContext } from "react";

import { FetchXmlBuilderContext } from "./FetchXmlBuilderContext";

export function useFetchXmlBuilder() {
  const context = useContext(FetchXmlBuilderContext);
  if (!context) {
    throw new Error("useFetchXmlBuilder must be used within FetchXmlBuilderProvider");
  }
  return context;
}
