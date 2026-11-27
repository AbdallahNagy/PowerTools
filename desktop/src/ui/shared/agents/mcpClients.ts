import type { McpStatusInfo } from "../../platform/desktopBridge";

export type McpClientId = "claude-code" | "claude-desktop" | "vs-code";

export interface McpClient {
  id: McpClientId;
  label: string;
  /** Where the snippet goes, in one sentence. */
  hint: string;
  snippet(status: McpStatusInfo): string;
}

/** Both snippets use the same launch, so a client config and the Claude Code command cannot disagree. */
function claudeCodeCommand(status: McpStatusInfo): string {
  return `claude mcp add --scope user dyno -- ${status.connectorCommand}`;
}

function clientConfigJson(status: McpStatusInfo): string {
  return JSON.stringify(
    { mcpServers: { dyno: { command: status.connector.command, args: status.connector.args } } },
    null,
    2,
  );
}

function vsCodeConfigJson(status: McpStatusInfo): string {
  return JSON.stringify(
    { servers: { dyno: { type: "stdio", command: status.connector.command, args: status.connector.args } } },
    null,
    2,
  );
}

/** The agent clients Dyno shows setup for, in Settings and on the welcome page. */
export const MCP_CLIENTS: readonly McpClient[] = [
  { id: "claude-code", label: "Claude Code", hint: "Run this in a terminal.", snippet: claudeCodeCommand },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    hint: "Add this to claude_desktop_config.json, then restart Claude Desktop.",
    snippet: clientConfigJson,
  },
  { id: "vs-code", label: "VS Code", hint: "Save this as .vscode/mcp.json in your workspace.", snippet: vsCodeConfigJson },
];
