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

function instanceTitle(
  tool: ToolTabDefinition,
  sameTool: readonly TabData[],
  connectionName: string | null,
): string {
  const sameConnectionCount = sameTool.filter(
    (tab) => (tab.connectionName ?? null) === connectionName,
  ).length;
  return sameConnectionCount === 0
    ? tool.title
    : `${tool.title} ${sameConnectionCount + 1}`;
}

export function openToolTab(
  state: TabState,
  tool: ToolTabDefinition,
  timestamp: number,
  connectionName: string | null = null,
): TabState {
  const sameTool = state.tabs.filter((tab) => tab.toolId === tool.id);

  if (tool.allowMultipleInstances === false && sameTool.length > 0) {
    const activeTabId = sameTool[0].id;
    return activeTabId === state.activeTabId
      ? state
      : { ...state, activeTabId };
  }

  const instanceId = createInstanceId(tool.id, state.tabs, timestamp);
  const boundConnection = connectionName ?? null;

  return {
    tabs: [
      ...state.tabs,
      {
        id: instanceId,
        toolId: tool.id,
        title: instanceTitle(tool, sameTool, boundConnection),
        connectionName: boundConnection,
      },
    ],
    activeTabId: instanceId,
  };
}

export function setTabConnection(
  state: TabState,
  tabId: string,
  connectionName: string | null,
): TabState {
  const tab = state.tabs.find((candidate) => candidate.id === tabId);
  if (!tab || (tab.connectionName ?? null) === connectionName) return state;

  return {
    ...state,
    tabs: state.tabs.map((candidate) =>
      candidate.id === tabId
        ? { ...candidate, connectionName }
        : candidate,
    ),
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
