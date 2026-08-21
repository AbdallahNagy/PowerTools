import { useReducer, type ReactNode } from "react";
import type { TabData } from "../common/types/tab-data.interface";
import {
  activateTab,
  addTab as addTabToState,
  closeTab as closeTabInState,
  createInitialTabState,
  openToolTab,
  type TabState,
} from "../shell/tabs/tabState";
import type { ToolDefinition } from "../tools/defineTool";
import { TOOL_REGISTRY } from "../tools/registry";
import { TabProviderContext } from "./TabProviderContext";

type TabAction =
  | { type: "open-tool"; tool: ToolDefinition; timestamp: number }
  | { type: "add-tab"; tab: TabData }
  | { type: "close-tab"; tabId: string }
  | { type: "activate-tab"; tabId: string };

const initialTabState = createInitialTabState(TOOL_REGISTRY.welcome);

function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case "open-tool":
      return openToolTab(state, action.tool, action.timestamp);
    case "add-tab":
      return addTabToState(state, action.tab);
    case "close-tab":
      return closeTabInState(state, action.tabId);
    case "activate-tab":
      return activateTab(state, action.tabId);
  }
}

export const TabProvider = ({ children }: { children: ReactNode }) => {
  const [{ tabs, activeTabId }, dispatch] = useReducer(
    tabReducer,
    initialTabState,
  );

  const openTool = (toolId: string) => {
    const def = TOOL_REGISTRY[toolId];
    if (!def) {
      console.warn(`openTool: unknown toolId "${toolId}"`);
      return;
    }

    dispatch({ type: "open-tool", tool: def, timestamp: Date.now() });
  };

  const addTab = (tab: TabData) => {
    dispatch({ type: "add-tab", tab });
  };

  const closeTab = (tabId: string) => {
    dispatch({ type: "close-tab", tabId });
  };

  const setActiveTab = (tabId: string) => {
    dispatch({ type: "activate-tab", tabId });
  };

  return (
    <TabProviderContext.Provider
      value={{ tabs, activeTabId, openTool, addTab, closeTab, setActiveTab }}
    >
      {children}
    </TabProviderContext.Provider>
  );
};
