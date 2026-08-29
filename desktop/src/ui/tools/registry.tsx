import { dataMigrationTool } from "./data-migration/tool";
import { fetchXmlBuilderTool } from "./fetchxml-builder/tool";
import { createToolRegistry } from "./defineTool";
import { welcomeTool } from "./welcome/tool";
import { pluginRegistrationTool } from "./plugin-registration/tool";

export const BUILT_IN_TOOLS = [
  welcomeTool,
  dataMigrationTool,
  pluginRegistrationTool,
  fetchXmlBuilderTool,
] as const;

const registry = createToolRegistry(BUILT_IN_TOOLS);

export const TOOL_REGISTRY = registry.toolsById;
export const ACTIVITY_BAR_TOOLS = registry.activityBarTools;

export type { ToolDefinition } from "./defineTool";
