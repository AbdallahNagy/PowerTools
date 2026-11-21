import type { AgentTool } from "./types.js";

/** Limits on what the server offers an agent. Every tool description and schema costs context on every call. */
export interface ToolBudget {
  maxTools: number;
  maxDescription: number;
  /** Total UTF-8 bytes of descriptions plus input and output schemas. */
  maxTotalBytes: number;
}

/** The agreed budget for the consolidated tool set (desktop/docs/mcp-tool-architecture.md). */
export const TOOL_BUDGET: ToolBudget = { maxTools: 28, maxDescription: 400, maxTotalBytes: 120_000 };

export interface BudgetUse {
  tools: number;
  totalBytes: number;
  problems: string[];
}

/** Measures a tool set against a budget. An empty problems list means it fits. */
export function measureToolBudget(tools: AgentTool[], budget: ToolBudget = TOOL_BUDGET): BudgetUse {
  const problems: string[] = [];
  if (tools.length > budget.maxTools) problems.push(`${tools.length} tools is above the budget of ${budget.maxTools}`);
  let totalBytes = 0;
  for (const tool of tools) {
    if (tool.description.length > budget.maxDescription) {
      problems.push(`"${tool.name}" description is ${tool.description.length} characters, above ${budget.maxDescription}`);
    }
    totalBytes += Buffer.byteLength(tool.description, "utf8");
    totalBytes += Buffer.byteLength(JSON.stringify(tool.inputSchema), "utf8");
    if (tool.outputSchema) totalBytes += Buffer.byteLength(JSON.stringify(tool.outputSchema), "utf8");
  }
  if (totalBytes > budget.maxTotalBytes) problems.push(`descriptions and schemas take ${totalBytes} bytes, above ${budget.maxTotalBytes}`);
  return { tools: tools.length, totalBytes, problems };
}
