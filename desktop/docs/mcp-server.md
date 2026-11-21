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

Always asking covers `records_delete`, `remove` and `solution_import`, any plan with a destructive step (for example rolling up patches, or lowering a column's maximum length), and any Dataverse message Power Tools does not know. The dialog says what will be removed. **Deny** is the default button. If you do not answer in 5 minutes, the call fails. If Power Tools is in the background, you get a notification and the window flashes.

New tables, columns, choices and similar components go into an unmanaged solution, whose publisher decides their prefix.

Data that comes back from Dataverse is marked as untrusted. Agents are told never to follow instructions found inside it.

## Tools

**Tools** lists the groups. Expand a group to see each tool with its description and whether it reads, changes, or destroys data. Search filters by name or description. Turn a group off to stop offering all its tools, or turn single tools off inside a group that is on. Connected agents are told right away.

| Group | Tools | Asks |
| --- | --- | --- |
| Connections | `connections_list`: the saved connections, whether each is online or on-premises, and the active one. | Never. |
| Read | `inspect_schema` (tables, columns, relationships, keys, global choices, roles), `inspect_ui` (forms, views, apps, site maps, modern commands, web resources), `inspect_solution` (solutions and their components and layers, publishers, environment variables, connection references, plug-in assemblies and steps, Custom APIs, processes, flows), `records_query` (FetchXML, a table with a filter, or one record by id). Each component comes back in the shape its apply tool takes. | Never. |
| Records | `records_write` (up to 100 creates, updates, upserts and associates, optionally all or nothing) and `execute_message` (any Dataverse message by name). | Like any change. An unknown message always asks. |
| Record deletes | `records_delete`: records by id, alternate key or a FetchXML query with a maximum count, and many-to-many links. | **Always.** |
| Schema | `table_apply` (a table with its columns, lookups, many-to-many relationships, keys and local choices) and `choice_apply` (a global choice and its options, colors and order). | Like any change. |
| Apps, forms and views | `form_apply` (a whole layout that creates the form when it is missing; add, move or remove a field, add a section or tab, set a label or visibility, add a subgrid; form libraries and onload, onsave and onchange handlers; system dashboards of lists and charts), `view_apply` (columns and widths, filter, sort, quick find columns, default view), `webresource_apply` (web resources from files or a folder on this computer) and `app_apply` (a model-driven app with its tables, forms, views, charts, dashboards, site map and roles, modern commands online; checked with ValidateApp). | Like any change. |
| Plug-ins, APIs and processes | `plugin_deploy` (an assembly .dll, or a NuGet package online), `plugin_step_apply` (steps with their images and enabled state), `customapi_apply` (a Custom API with its parameters, properties and plug-in type), `flow_apply` (a cloud flow with its connection references, turned on or off; online only) and `process_apply` (a classic workflow or custom process action from typed steps, activated or in draft; online and on-premises). | Like any change. Changing a field Dataverse fixes once saved recreates the Custom API, which always asks. |
| Security | `role_apply`: a security role with privileges per table and depth and other privileges by name, the users and teams that have it, and field security profiles with their column permissions and members. | Like any change. Taking a privilege away always asks. |
| Solutions | `solution_apply` (publisher, solution, patch, components, rolling up patches), `config_apply` (environment variables and connection references), `solution_export` and `solution_import`. | Changes ask; rolling up patches and imports always ask. |
| Remove components | `remove`: deletes one component (a table, column, choice or option, form, view, web resource, process, flow, plug-in, environment variable, solution and more), takes one out of a solution, or removes its unmanaged active layer. It refuses managed components and ones other components depend on. Never records. | **Always.** |

Record deletes and component removal are separate groups, so allowing one never allows the other.

The server also offers guides as MCP resources, which tool descriptions point to. `powertools://guides/cloud-flows` explains the `flow_apply` spec: the definition, connection references, and what to do when a connector needs a sign-in. An agent cannot create connections: a flow whose connection references have no connection stays off, and the result names the connectors to sign in to in the maker portal. `powertools://guides/classic-workflows` explains the `process_apply` spec: triggers, steps, values and conditions, and how a process read with `inspect_solution` is sent back.

### How a change runs

Every tool that changes something takes the state you want, not a list of commands. Before it changes anything, Power Tools reads the environment and makes a plan. The dialog shows that plan, step by step in the order the steps run, not the agent's arguments. Only what differs runs, so sending the same spec again changes nothing, and nothing the spec leaves out is removed. What runs is exactly what you approved: if the environment changes between the dialog and the run, the call is refused and nothing changes. A step that cannot run on this environment (for example a connection reference on-premises) or that Dataverse does not allow (for example changing a column's type) is shown with the reason; the apply stops there, and the dialog says which steps run before it. An agent can ask for the plan alone with `dryRun`, which never asks you.

These tools work the same on Dataverse online and on-premises. Where a feature is missing, the plan says so and names what works instead.

## Activity log

**Recent activity** on the page shows what agents did: when, which tool, which connection and the outcome. It is kept on this computer for 30 days, in your Power Tools user data folder, and never sent anywhere. It holds tool names and short summaries, not tokens or record contents.
