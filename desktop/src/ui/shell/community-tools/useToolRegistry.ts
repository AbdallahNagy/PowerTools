import { createElement, useContext, type ComponentType } from "react";

import type { LoadedCommunityTool } from "../../platform/desktopBridge";
import type { ToolDefinition } from "../../tools/defineTool";
import { ACTIVITY_BAR_TOOLS, TOOL_REGISTRY } from "../../tools/registry";
import communityToolIcon from "../../assets/icons/community-tool-icon.svg";
import { CommunityToolFrame } from "./CommunityToolFrame";
import { CommunityToolsContext, type ToolRegistryView } from "./CommunityToolsContext";

/** Keeps a tool's component identity while its loaded data is unchanged, so a refresh does not remount open frames. */
export type CommunityDefinitionCache = Map<string, { key: string; definition: ToolDefinition }>;

function definitionFor(tool: LoadedCommunityTool, cache: CommunityDefinitionCache): ToolDefinition | null {
  const manifest = tool.manifest;
  if (!manifest) return null;
  const key = JSON.stringify(tool);
  const cached = cache.get(manifest.id);
  if (cached?.key === key) return cached.definition;

  const component: ComponentType = function CommunityToolComponent() {
    return createElement(CommunityToolFrame, { tool });
  };
  const definition: ToolDefinition = {
    id: manifest.id,
    title: manifest.name,
    tooltip: manifest.description,
    icon: tool.iconDataUrl ?? communityToolIcon,
    showInActivityBar: true,
    component,
    allowMultipleInstances: manifest.allowMultipleInstances,
    source: "local",
  };
  cache.set(manifest.id, { key, definition });
  return definition;
}

/**
 * Layers community tools on top of the built-in registry. Only a tool that is ready AND consented
 * gets a definition: consent is the gate for running it, so an unreviewed tool never gets a tab.
 */
export function createToolRegistryView(
  tools: readonly LoadedCommunityTool[],
  cache: CommunityDefinitionCache,
): ToolRegistryView {
  const community: ToolDefinition[] = [];
  const seen = new Set<string>();
  for (const tool of tools) {
    if (tool.status !== "ready" || !tool.consentGranted) continue;
    const id = tool.manifest?.id;
    // A built-in id always wins.
    if (!id || id in TOOL_REGISTRY || seen.has(id)) continue;
    const definition = definitionFor(tool, cache);
    if (!definition) continue;
    seen.add(id);
    community.push(definition);
  }
  community.sort((a, b) => a.title.localeCompare(b.title));

  for (const id of [...cache.keys()]) {
    if (!seen.has(id)) cache.delete(id);
  }

  return {
    toolsById: { ...TOOL_REGISTRY, ...Object.fromEntries(community.map((definition) => [definition.id, definition])) },
    activityBarTools: [...ACTIVITY_BAR_TOOLS, ...community],
  };
}

export function useToolRegistry(): ToolRegistryView {
  return useContext(CommunityToolsContext).registry;
}

export function useCommunityTools(): { tools: LoadedCommunityTool[]; refresh(): Promise<void>; openManager(): void } {
  const { tools, refresh, openManager } = useContext(CommunityToolsContext);
  return { tools, refresh, openManager };
}
