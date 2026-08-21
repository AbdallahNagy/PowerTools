import { useMemo } from "react";
import type { TabData } from "../../common/types/tab-data.interface";
import type { ToolDefinition } from "../../tools/defineTool";
import { ToolErrorBoundary } from "./ToolErrorBoundary";
import { ToolRuntimeContext } from "./ToolRuntimeContext";

interface ToolHostProps {
  tab: Pick<TabData, "id" | "toolId" | "title">;
  definition: ToolDefinition;
}

export default function ToolHost({ tab, definition }: ToolHostProps) {
  const runtime = useMemo(
    () => ({ toolId: tab.toolId, instanceId: tab.id }),
    [tab.id, tab.toolId],
  );
  const Tool = definition.component;

  return (
    <ToolRuntimeContext.Provider value={runtime}>
      <ToolErrorBoundary toolTitle={definition.title}>
        <Tool />
      </ToolErrorBoundary>
    </ToolRuntimeContext.Provider>
  );
}
