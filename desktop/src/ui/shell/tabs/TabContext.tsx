import { useReducer, type ReactNode } from "react";
import type { TabData } from "./types";
import { getActiveConnectionSnapshot } from "../../shared/connections/activeConnectionSnapshot";
import {
  activateTab,
  addTab as addTabToState,
  closeAllTabs as closeAllTabsInState,
  closeOtherTabs as closeOtherTabsInState,
  closeTab as closeTabInState,
  createInitialTabState,
  openToolTab,
  setTabConnection as setTabConnectionInState,
  type TabState,
} from "./tabState";
import type { ToolDefinition } from "../../tools/defineTool";
import { TOOL_REGISTRY } from "../../tools/registry";
import { TabProviderContext, type OpenToolOptions } from "./TabProviderContext";

type TabAction =
  | {
      type: "open-tool";
      tool: ToolDefinition;
      timestamp: number;
      connectionId: string | null;
    }
  | { type: "add-tab"; tab: TabData }
  | { type: "close-tab"; tabId: string }
  | { type: "close-other-tabs"; tabId: string }
  | { type: "close-all-tabs" }
  | { type: "activate-tab"; tabId: string }
  | { type: "set-connection"; tabId: string; connectionId: string | null };

const initialTabState = createInitialTabState(TOOL_REGISTRY.welcome);

function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case "open-tool":
      return openToolTab(
        state,
        action.tool,
        action.timestamp,
        action.connectionId,
      );
    case "add-tab":
      return addTabToState(state, action.tab);
    case "close-tab":
      return closeTabInState(state, action.tabId);
    case "close-other-tabs":
      return closeOtherTabsInState(state, action.tabId);
    case "close-all-tabs":
      return closeAllTabsInState(state);
    case "activate-tab":
      return activateTab(state, action.tabId);
    case "set-connection":
      return setTabConnectionInState(state, action.tabId, action.connectionId);
  }
}

export const TabProvider = ({ children }: { children: ReactNode }) => {
  const [{ tabs, activeTabId }, dispatch] = useReducer(
    tabReducer,
    initialTabState,
  );

  const openTool = (toolId: string, options?: OpenToolOptions) => {
    const def = TOOL_REGISTRY[toolId];
    if (!def) {
      console.warn(`openTool: unknown toolId "${toolId}"`);
      return;
    }

    const { id, loaded } = getActiveConnectionSnapshot();
    const connectionId =
      options?.connectionId !== undefined
        ? options.connectionId
        : loaded
          ? id
          : null;
    dispatch({
      type: "open-tool",
      tool: def,
      timestamp: Date.now(),
      connectionId,
    });
  };

  const setTabConnection = (tabId: string, connectionId: string | null) => {
    dispatch({ type: "set-connection", tabId, connectionId });
  };

  const addTab = (tab: TabData) => {
    dispatch({ type: "add-tab", tab });
  };

  const closeTab = (tabId: string) => {
    dispatch({ type: "close-tab", tabId });
  };

  const closeOtherTabs = (tabId: string) => {
    dispatch({ type: "close-other-tabs", tabId });
  };

  const closeAllTabs = () => {
    dispatch({ type: "close-all-tabs" });
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
        closeOtherTabs,
        closeAllTabs,
        setActiveTab,
        setTabConnection,
      }}
    >
      {children}
    </TabProviderContext.Provider>
  );
};
