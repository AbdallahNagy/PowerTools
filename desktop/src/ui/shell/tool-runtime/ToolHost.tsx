import { useMemo } from "react";
import type { TabData } from "../tabs/types";
import type { ToolDefinition } from "../../tools/defineTool";
import { PrimaryActionScope } from "../../shared/keyboard";
import { ToolErrorBoundary } from "./ToolErrorBoundary";
import { ToolRuntimeContext } from "./ToolRuntimeContext";

interface ToolHostProps {
  tab: Pick<TabData, "id" | "toolId" | "title" | "connectionId">;
  definition: ToolDefinition;
}

export default function ToolHost({ tab, definition }: ToolHostProps) {
  const runtime = useMemo(
    () => ({
      toolId: tab.toolId,
      instanceId: tab.id,
      connectionId: tab.connectionId ?? null,
    }),
    [tab.connectionId, tab.id, tab.toolId],
  );
  const Tool = definition.component;

  return (
    <ToolRuntimeContext.Provider value={runtime}>
      <PrimaryActionScope instanceId={tab.id}>
        <ToolErrorBoundary toolTitle={definition.title}>
          <Tool />
        </ToolErrorBoundary>
      </PrimaryActionScope>
    </ToolRuntimeContext.Provider>
  );
}
