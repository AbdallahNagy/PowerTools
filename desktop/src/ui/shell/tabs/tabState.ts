import type { TabData } from "../../common/types/tab-data.interface";
import type { ToolDefinition } from "../../tools/defineTool";

export interface TabState {
  tabs: TabData[];
  activeTabId: string;
}

type ToolTabDefinition = Pick<
  ToolDefinition,
  "id" | "title" | "allowMultipleInstances"
>;

export function createInitialTabState(
  tool: Pick<ToolDefinition, "id" | "title">,
): TabState {
  return {
    tabs: [{ id: tool.id, toolId: tool.id, title: tool.title }],
    activeTabId: tool.id,
  };
}

function createInstanceId(
  toolId: string,
  tabs: readonly TabData[],
  timestamp: number,
): string {
  const baseId = `${toolId}-${timestamp}`;
  const existingIds = new Set(tabs.map((tab) => tab.id));
  if (!existingIds.has(baseId)) return baseId;

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) suffix += 1;
  return `${baseId}-${suffix}`;
}

export function openToolTab(
  state: TabState,
  tool: ToolTabDefinition,
  timestamp: number,
): TabState {
  const sameTool = state.tabs.filter((tab) => tab.toolId === tool.id);

  if (tool.allowMultipleInstances === false && sameTool.length > 0) {
    const activeTabId = sameTool[0].id;
    return activeTabId === state.activeTabId
      ? state
      : { ...state, activeTabId };
  }

  const instanceId = createInstanceId(tool.id, state.tabs, timestamp);
  const title =
    sameTool.length === 0
      ? tool.title
      : `${tool.title} ${sameTool.length + 1}`;

  return {
    tabs: [
      ...state.tabs,
      { id: instanceId, toolId: tool.id, title },
    ],
    activeTabId: instanceId,
  };
}

export function addTab(state: TabState, tab: TabData): TabState {
  const alreadyExists = state.tabs.some((existing) => existing.id === tab.id);
  if (alreadyExists && state.activeTabId === tab.id) return state;

  return {
    tabs: alreadyExists ? state.tabs : [...state.tabs, tab],
    activeTabId: tab.id,
  };
}

export function activateTab(state: TabState, tabId: string): TabState {
  return state.activeTabId === tabId ? state : { ...state, activeTabId: tabId };
}

export function closeTab(state: TabState, tabId: string): TabState {
  const closedIndex = state.tabs.findIndex((tab) => tab.id === tabId);
  const tabs = state.tabs.filter((tab) => tab.id !== tabId);

  if (state.activeTabId !== tabId) return { ...state, tabs };

  const nextActiveTab =
    tabs[closedIndex - 1] ?? tabs[closedIndex] ?? tabs[0];
  return {
    tabs,
    activeTabId: nextActiveTab?.id ?? "",
  };
}
