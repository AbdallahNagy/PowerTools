# The MCP server lives in Electron main, is reached over stdio by default, and Power Tools decides approval

Status: accepted, 2026-11-12

## Context

Power Tools will let AI agents (Claude Code, Claude Desktop, Copilot) work with Dataverse through the running app, using the user's signed-in connections. Connections, tokens, the active connection and any user prompt all live in the running Electron app. MCP clients start stdio servers themselves, as their own child processes. Agents will make schema and plugin changes as well as reads, and some of those changes cannot be undone. The full design is in `desktop/docs/superpowers/specs/2026-11-12-mcp-server-design.md`.

## Decision

**Transport and hosting**

- The MCP server is a Streamable HTTP endpoint hosted in Electron main.
  - It is bound to 127.0.0.1.
  - It is off by default, behind a Settings switch.
  - It checks the `Host` header, rejects any request carrying an `Origin` header, requires a bearer token, and requires a live MCP session.
- Clients connect through a small stdio connector (`powertools-mcp`) by default.
  - The connector reads the port and a per-launch token from a discovery file in the user's profile.
  - It relays JSON-RPC to the endpoint and holds no MCP logic of its own.
- Direct Streamable HTTP, with a fixed port and a stable token kept in `safeStorage`, is an opt-in option for clients that only accept a URL.

**Organization**

- The tools are grouped by Dataverse domain (`metadata_*`, `schema_*`, `solutions_*`, `plugins_*`, and so on), not by built-in tool screen.
- They reach the sidecar through new `/api/agent/*` routes that reuse the existing C# services, and through the existing `/api/community-tools/*` API.

**Approval**

- Power Tools classifies every call as read, change or destructive. It uses one fixed table, shared with the community tool Broker, and derives the class from the arguments for `execute_message` and argument-dependent tools.
- A tool's own declarations and MCP annotations never decide approval.
- Reads run.
- Changes run without a prompt only when the target connection's "Let agents make non-destructive changes without asking" switch is on.
- Destructive calls always ask the user in the app, and no setting can turn that off. Destructive covers:
  - any removal
  - replacing a plugin assembly
  - lowering a column's max length
  - `CloneAsSolution`
  - unknown messages
- Calls run with the user's own token. Nothing in Dataverse marks them as agent-made.

## Alternatives rejected

- **A stdio server as the main transport.** A client-started process cannot reach the running app's connections, tokens or approval UI.
- **Hosting the server in the sidecar.** Tokens, the active connection and the approval UI live in Electron, so every call would need a callback into main.
- **Moving Electron↔sidecar to stdio.** A process's stdio has one owner, so it does not help agents. It would also force every renderer API call through IPC, for little security gain over loopback plus the per-launch secret.
- **A stable token as the default.** It leaves a long-lived secret in plain text in client config files.
- **One namespace per built-in tool.** It ties agent tool names to UI screens, and they break when a screen changes or becomes a community tool.
- **Approval from tool hints.** A tool, or an agent, could mark a destructive call as safe.

## Consequences

- MCP adds a second way into Dataverse alongside the renderer. Both share the sidecar header building and the message classification, so they cannot drift.
- Each new built-in capability that agents should use needs its own agent tool and `/api/agent/*` route. The tool brief gains an "Agent tools" section to decide this up front.
- The connector is an extra signed binary in the installer. Only Windows is built in the first version.
- Community tools can later add agent tools only in their own `community_<toolId>_*` group, classified through `authorize()` against their manifest. They never enter the core groups.
