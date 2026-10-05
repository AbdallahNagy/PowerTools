import { bulkWorkflowExecutionTool } from "./bulk-workflow-execution/tool";
import { dataMigrationTool } from "./data-migration/tool";
import { fetchXmlBuilderTool } from "./fetchxml-builder/tool";
import { fetchXmlTesterTool } from "./fetchxml-tester/tool";
import { pluginRegistrationTool } from "./plugin-registration/tool";
import { polymorphicLookupTool } from "./polymorphic-lookup-creator/tool";
import { solutionComponentsMoverTool } from "./solution-components-mover/tool";
import { workflowActivitiesTool } from "./workflow-activities-viewer/tool";
import { createToolRegistry } from "./defineTool";
import { welcomeTool } from "./welcome/tool";

export const BUILT_IN_TOOLS = [
  welcomeTool,
  bulkWorkflowExecutionTool,
  dataMigrationTool,
  fetchXmlBuilderTool,
  fetchXmlTesterTool,
  pluginRegistrationTool,
  polymorphicLookupTool,
  solutionComponentsMoverTool,
  workflowActivitiesTool,
] as const;

const registry = createToolRegistry(BUILT_IN_TOOLS);

export const TOOL_REGISTRY = registry.toolsById;
export const ACTIVITY_BAR_TOOLS = registry.activityBarTools;

export type { ToolDefinition } from "./defineTool";
