import { createContext } from "react";

import type { LoadedCommunityTool } from "../../platform/desktopBridge";
import { ACTIVITY_BAR_TOOLS, TOOL_REGISTRY } from "../../tools/registry";
import type { ToolDefinition } from "../../tools/defineTool";

export interface ToolRegistryView {
  toolsById: Record<string, ToolDefinition>;
  activityBarTools: ToolDefinition[];
}

export interface CommunityToolsContextValue {
  /** Every remembered community tool, whatever its status. Empty while loading or when listing failed. */
  tools: LoadedCommunityTool[];
  refresh(): Promise<void>;
  openManager(): void;
  /** Built-in tools plus the community tools that are ready and consented. */
  registry: ToolRegistryView;
}

/** Without a provider there are no community tools, only the built-in ones. */
export const CommunityToolsContext = createContext<CommunityToolsContextValue>({
  tools: [],
  refresh: async () => undefined,
  openManager: () => undefined,
  registry: { toolsById: TOOL_REGISTRY, activityBarTools: ACTIVITY_BAR_TOOLS },
});
