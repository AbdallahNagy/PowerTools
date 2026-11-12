import { plainResult } from "../results.js";
import type { AgentTool } from "../types.js";

export const connectionsList: AgentTool = {
  name: "connections_list",
  group: "connections",
  title: "List connections",
  description:
    "Lists the Dataverse connections saved in Power Tools by display name, with kind, environment URL and which one is active. Pass a display name as \"connection\" to any other tool to target it. Read-only.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  effect: "read",
  async run(_args, ctx) {
    const connections = ctx.listConnections();
    return plainResult(`${connections.length} saved connection(s).`, { connections });
  },
};
