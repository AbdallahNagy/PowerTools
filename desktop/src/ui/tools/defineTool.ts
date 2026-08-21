import type { ComponentType } from "react";

export interface ToolDefinition {
  id: string;
  title: string;
  tooltip?: string;
  icon: string;
  showInActivityBar: boolean;
  component: ComponentType;
  /** Allow opening more than one tab of this tool. Defaults to true. */
  allowMultipleInstances?: boolean;
}

export function defineTool<const Definition extends ToolDefinition>(
  definition: Definition,
): Definition {
  return definition;
}

export function createToolRegistry(
  tools: readonly ToolDefinition[],
): {
  toolsById: Record<string, ToolDefinition>;
  activityBarTools: ToolDefinition[];
} {
  const seenIds = new Set<string>();
  const entries: Array<[string, ToolDefinition]> = [];

  for (const tool of tools) {
    if (seenIds.has(tool.id)) {
      throw new Error(`Duplicate built-in tool id "${tool.id}"`);
    }
    seenIds.add(tool.id);
    entries.push([tool.id, tool]);
  }

  return {
    toolsById: Object.fromEntries(entries),
    activityBarTools: tools.filter((tool) => tool.showInActivityBar),
  };
}
