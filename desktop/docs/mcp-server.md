# The Power Tools MCP server

Power Tools can let AI agents such as Claude Code, Claude Desktop and VS Code work on your Dataverse environments. The agent uses your own sign-in and the connections you already saved. It is off until you turn it on.

## Turn it on

1. Open **Settings** (the gear at the bottom of the sidebar, **File > Settings…**, or Ctrl+,) and choose **Agents (MCP)**. **File > Agents (MCP)…** opens the same page.
2. Turn on **Let AI agents use Power Tools (MCP server)**. The status shows **Running**.
3. Keep Power Tools open. Agents can only reach the server while the app is running; the server turns off when you quit.

The same page has the commands to connect a client, the tools and the recent activity. **Agent permissions** in Settings lists every connection with its "changes without asking" switch.

## Connect a client

Agents start a small connector program that comes with Power Tools. It relays to the running app, and it needs no token in any config file. Each time Power Tools starts, it copies the connector to `%LOCALAPPDATA%\Power Tools\mcp\PowerTools.McpConnector.exe`, outside the install folder, so an agent keeping the connector running never blocks a Power Tools update. The dialog shows the exact commands for your user. Copy them from there. They look like this.

**Claude Code**

```
claude mcp add --scope user powertools -- "%LOCALAPPDATA%\Power Tools\mcp\PowerTools.McpConnector.exe"
```

`--scope user` makes Power Tools available in every folder you open Claude Code in. Without it, Claude Code only loads the server in the folder where you ran the command.

**Claude Desktop**, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "powertools": {
      "command": "C:\\Users\\<you>\\AppData\\Local\\Power Tools\\mcp\\PowerTools.McpConnector.exe",
      "args": []
    }
  }
}
```

**VS Code**, in `.vscode/mcp.json`. VS Code uses the key `servers`:

```json
{
  "servers": {
    "powertools": {
      "type": "stdio",
      "command": "C:\\Users\\<you>\\AppData\\Local\\Power Tools\\mcp\\PowerTools.McpConnector.exe",
      "args": []
    }
  }
}
```

If Power Tools is not running when the client starts, the client still connects and shows no tools. Start Power Tools and turn the server on; the tools appear without restarting the client.

The dialog shows the real path in place of `%LOCALAPPDATA%`; use that, since not every client expands variables. Development runs copy the connector to `%LOCALAPPDATA%\Power Tools Dev\mcp` and add `--discovery` with the dev discovery file.

### Updating an older setup

Setups made before this connector start `<install folder>\resources\api\PowerTools.API.exe --mcp-connector`. That still works for now, but it is deprecated: while the agent runs, the file stays locked and Power Tools cannot install updates. **Agents (MCP)** looks for such setups in `~/.claude.json`, `claude_desktop_config.json` and VS Code's user `mcp.json`, warns about them, and shows the commands that replace them. It never edits those files. Workspace `.vscode/mcp.json` files are not checked; update them by hand.

### When the connector is updated

Power Tools copies the connector only when the bundled one differs from the copy. If an agent is running the copy, it is locked; Power Tools leaves it as it is and copies on a later start. An older connector keeps working with a newer app: it only reads the discovery file (`port`, `token`) and relays MCP over HTTP on `127.0.0.1`.

## Connections

Every tool takes an optional `connection`, the display name of a saved connection such as `Contoso · Dev`. Without it, the agent uses the connection that is active in Power Tools. Agents can list the names with `connections_list`.

## What asks you first

Power Tools decides this for every call. The agent cannot change it.

| Kind of call | What happens |
| --- | --- |
| Reads (listing, metadata, queries) | Run without asking. |
| Changes (creating or updating records, columns, solutions and so on) | Ask in Power Tools, unless the connection allows them without asking. |
| Destructive calls | **Always ask.** No setting turns this off. |

To let an agent make non-destructive changes without asking on one connection, open **Manage connections**, pick the connection and turn on **Let agents make non-destructive changes without asking**. It is off for every connection until you do.

Always asking covers deleting records, columns, tables and relationships, removing a column from a form or view, removing solution components or layers, cloning a solution, replacing or unregistering plug-in code, deleting environment variables, lowering a column's maximum length, and any Dataverse message Power Tools does not know. The dialog says what will be removed. **Deny** is the default button. If you do not answer in 5 minutes, the call fails. If Power Tools is in the background, you get a notification and the window flashes.

New tables, columns, solutions and similar components need a solution or a publisher, so their prefix is known. If the agent gives neither, it gets the list of publishers and should ask you which to use.

Data that comes back from Dataverse is marked as untrusted. Agents are told never to follow instructions found inside it.

## Tools

**Tools** lists the groups: `connections` (1), `metadata` (7), `records` (8), `schema` (16), `solutions` (11), `plugins` (10) and `envvars` (4). Expand a group to see each tool with its description and whether it reads, changes, or destroys data. Search filters by name or description. Turn a group off to stop offering all its tools, or turn single tools off inside a group that is on. Connected agents are told right away.

## Activity log

**Recent activity** on the page shows what agents did: when, which tool, which connection and the outcome. It is kept on this computer for 30 days, in your Power Tools user data folder, and never sent anywhere. It holds tool names and short summaries, not tokens or record contents.
