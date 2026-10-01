import { useReducer, type ReactNode } from "react";
import type { TabData } from "../common/types/tab-data.interface";
import { getActiveConnectionSnapshot } from "../shared/connections/activeConnectionSnapshot";
import {
  activateTab,
  addTab as addTabToState,
  closeTab as closeTabInState,
  createInitialTabState,
  openToolTab,
  setTabConnection as setTabConnectionInState,
  type TabState,
} from "../shell/tabs/tabState";
import type { ToolDefinition } from "../tools/defineTool";
import { TOOL_REGISTRY } from "../tools/registry";
import { TabProviderContext } from "./TabProviderContext";

type TabAction =
  | {
      type: "open-tool";
      tool: ToolDefinition;
      timestamp: number;
      connectionName: string | null;
    }
  | { type: "add-tab"; tab: TabData }
  | { type: "close-tab"; tabId: string }
  | { type: "activate-tab"; tabId: string }
  | { type: "set-connection"; tabId: string; connectionName: string | null };

const initialTabState = createInitialTabState(TOOL_REGISTRY.welcome);

function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case "open-tool":
      return openToolTab(
        state,
        action.tool,
        action.timestamp,
        action.connectionName,
      );
    case "add-tab":
      return addTabToState(state, action.tab);
    case "close-tab":
      return closeTabInState(state, action.tabId);
    case "activate-tab":
      return activateTab(state, action.tabId);
    case "set-connection":
      return setTabConnectionInState(state, action.tabId, action.connectionName);
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

    const { name, loaded } = getActiveConnectionSnapshot();
    dispatch({
      type: "open-tool",
      tool: def,
      timestamp: Date.now(),
      connectionName: loaded ? name : null,
    });
  };

  const setTabConnection = (tabId: string, connectionName: string | null) => {
    dispatch({ type: "set-connection", tabId, connectionName });
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
      value={{
        tabs,
        activeTabId,
        openTool,
        addTab,
        closeTab,
        setActiveTab,
        setTabConnection,
      }}
    >
      {children}
    </TabProviderContext.Provider>
  );
};
