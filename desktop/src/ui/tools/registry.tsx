import type { ComponentType } from "react";
import DataMigrationIcon from "../assets/icons/data-migration-icon.svg";
import DataMigration from "../components/tools/DataMigration";
import WelcomeTab from "../components/tools/Welcome";
import FetchXmlBuilder, { FetchXmlBuilderIcon } from "./fetchxml-builder";

export interface ToolDefinition {
  toolId: string;
  title: string;
  tooltip?: string;
  icon: string;
  component: ComponentType;
  /** Allow opening more than one tab of this tool. Defaults to true. */
  allowMultipleInstances?: boolean;
}

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  welcome: {
    toolId: "welcome",
    title: "Welcome",
    icon: "",
    component: WelcomeTab,
    allowMultipleInstances: false,
  },
  "data-migration": {
    toolId: "data-migration",
    title: "Data Migration",
    tooltip: "data migration",
    icon: DataMigrationIcon,
    component: DataMigration,
    allowMultipleInstances: true,
  },
  "fetchxml-builder": {
    toolId: "fetchxml-builder",
    title: "FetchXML Builder",
    tooltip: "Build, run, and refine FetchXML queries",
    icon: FetchXmlBuilderIcon,
    component: FetchXmlBuilder,
    allowMultipleInstances: true,
  },
};

/** Tools listed in the activity bar, in display order. */
export const ACTIVITY_BAR_TOOLS: ToolDefinition[] = [
  TOOL_REGISTRY["data-migration"],
  TOOL_REGISTRY["fetchxml-builder"],
];
