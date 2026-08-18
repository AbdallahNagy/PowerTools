import { useContext } from "react";

import { TabProviderContext } from "./TabProviderContext";

export const useTabs = () => {
  const context = useContext(TabProviderContext);
  if (context === undefined) {
    throw new Error("useTabs must be used within a TabProvider");
  }
  return context;
};
