import DataMigrationIcon from "../assets/icons/data-migration-icon.svg";
import DataMigration from "../components/tools/DataMigration";
import FetchXmlBuilder, { FetchXmlBuilderIcon } from "./fetchxml-builder";
import { createToolRegistry, defineTool } from "./defineTool";
import { welcomeTool } from "./welcome/tool";

export const BUILT_IN_TOOLS = [
  welcomeTool,
  defineTool({
    id: "data-migration",
    title: "Data Migration",
    tooltip: "data migration",
    icon: DataMigrationIcon,
    showInActivityBar: true,
    component: DataMigration,
    allowMultipleInstances: true,
  }),
  defineTool({
    id: "fetchxml-builder",
    title: "FetchXML Builder",
    tooltip: "Build, run, and refine FetchXML queries",
    icon: FetchXmlBuilderIcon,
    showInActivityBar: true,
    component: FetchXmlBuilder,
    allowMultipleInstances: true,
  }),
] as const;

const registry = createToolRegistry(BUILT_IN_TOOLS);

export const TOOL_REGISTRY = registry.toolsById;
export const ACTIVITY_BAR_TOOLS = registry.activityBarTools;

export type { ToolDefinition } from "./defineTool";
