import type { ComponentType } from "react";
import DataMigrationIcon from "../assets/icons/data-migration-icon.svg";
import MetadataExplorerIcon from "../assets/icons/metadata-explorer-icon.svg";
import DataMigration from "../components/tools/DataMigration";
import MetadataExplorer from "../components/tools/MetadataExplorer";
import WelcomeTab from "../components/tools/Welcome";

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
  "metadata-explorer": {
    toolId: "metadata-explorer",
    title: "Metadata Explorer",
    tooltip: "Browse tables and build FetchXML filters",
    icon: MetadataExplorerIcon,
    component: MetadataExplorer,
    allowMultipleInstances: true,
  },
};

/** Tools listed in the activity bar, in display order. */
export const ACTIVITY_BAR_TOOLS: ToolDefinition[] = [
  TOOL_REGISTRY["data-migration"],
  TOOL_REGISTRY["metadata-explorer"],
];
