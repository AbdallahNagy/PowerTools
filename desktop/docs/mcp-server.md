# The Power Tools MCP server

Power Tools can let AI agents such as Claude Code, Claude Desktop and VS Code work on your Dataverse environments. The agent uses your own sign-in and the connections you already saved. It is off until you turn it on.

## Turn it on

1. Open **File > Agents (MCP)…**.
2. Turn on **Let AI agents use Power Tools (MCP server)**. The status shows **Running**.
3. Keep Power Tools open. Agents can only reach the server while the app is running; the server turns off when you quit.

The same dialog has the commands to connect a client, the tool groups, the direct HTTP option and the recent activity.

## Connect a client

Agents start a small connector program that comes with Power Tools. It relays to the running app, and it needs no token in any config file. The dialog shows the exact commands for your install, including the folder Power Tools is installed in. Copy them from there. They look like this.

**Claude Code**

```
claude mcp add powertools -- "<install folder>\resources\api\PowerTools.API.exe" --mcp-connector
```

**Claude Desktop**, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "powertools": {
      "command": "<install folder>\\resources\\api\\PowerTools.API.exe",
      "args": ["--mcp-connector"]
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
      "command": "<install folder>\\resources\\api\\PowerTools.API.exe",
      "args": ["--mcp-connector"]
    }
  }
}
```

If Power Tools is not running when the client starts, the client still connects and shows no tools. Start Power Tools and turn the server on; the tools appear without restarting the client.

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

Always asking covers deleting records, columns, tables and relationships, removing solution components or layers, cloning a solution, replacing or unregistering plug-in code, deleting environment variables, lowering a column's maximum length, and any Dataverse message Power Tools does not know. The dialog says what will be removed. **Deny** is the default button. If you do not answer in 5 minutes, the call fails. If Power Tools is in the background, you get a notification and the window flashes.

New tables, columns, solutions and similar components need a solution or a publisher, so their prefix is known. If the agent gives neither, it gets the list of publishers and should ask you which to use.

Data that comes back from Dataverse is marked as untrusted. Agents are told never to follow instructions found inside it.

## Tool groups

The dialog lists the groups with their tool counts: `connections` (1), `metadata` (7), `records` (8), `schema` (13), `solutions` (10), `plugins` (10) and `envvars` (4). Turn a group off to stop offering its tools. Connected agents are told right away.

## Activity log

**Recent activity** in the dialog shows what agents did: when, which tool, which connection and the outcome. It is kept on this computer for 30 days, in your Power Tools user data folder, and never sent anywhere. It holds tool names and short summaries, not tokens or record contents.

## Direct HTTP

Some clients can only take a URL. Under **Direct HTTP**, turn the option on and pick a port (1024 to 65535, default 47800). Then choose **Copy client config** and paste it into the client:

```json
{ "type": "http", "url": "http://127.0.0.1:47800/mcp", "headers": { "Authorization": "Bearer <token>" } }
```

- The token is copied from the app and never shown on screen. It is kept encrypted with your Windows account and stays the same between launches.
- It is a long-lived secret, so treat the pasted config like a password. **Regenerate token** makes a new one, restarts the server and stops clients that use the old config.
- The server only listens on `127.0.0.1`. If the port is taken, the dialog says so and the server stays off.

The connector command above stays the safer choice where a client supports it.
