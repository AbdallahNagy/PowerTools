# Community plugins for Power Tools: design

Date: 2026-11-11
Status: draft, waiting for owner approval
Scope: the big picture for all four projects, and the full design for project 1 (runtime and SDK).

This design starts from the app code and the owner's stated wishes. It does not build on the earlier research under `docs/research/` or on earlier plugin notes; the owner asked for a fresh start.

## Intent

Power Tools ships 12 built-in tools. The owner wants the community to add their own, the way XrmToolBox does, with three differences:

- Building a plugin is done mostly by coding agents, and the kit makes it hard for an agent to get it wrong.
- A plugin looks and behaves like a built-in tool and cannot slow the app down.
- Authors of XrmToolBox and Power Platform ToolBox tools can bring them over with an agent doing most of the work.

Publishing is free and open.

## Decisions the owner made

- Plugins are web-only. The community ships no C# and nothing runs in the sidecar on a plugin's behalf except the host's own generic Dataverse API. A tool that needs .NET-only work becomes a new host capability or stays built-in.
- The trust model in "Trust" below.
- The four projects and their order.
- The shape of project 1 as described in "Project 1" below.

- The name is **community tool**. The app already has a Plugin Registration tool, where "plugin" means a Dataverse server-side plugin, so the word "plugin" must not appear for this feature in anything a user or author sees: UI text, the manifest file name, package names, the URL scheme, documentation, and the website. This document still says "plugin" in its prose as shorthand for "community tool"; the identifiers it names already follow the rule.

Everything marked "(my call)" was chosen by the designer and not discussed. The owner should check those.

## Goals

- A plugin author goes from idea to a working, native-looking tool using an agent and the kit.
- An installed plugin can do only what its manifest declares.
- A plugin costs nothing at startup and cannot freeze or crash the shell.
- Power Platform ToolBox tools port with an API mapping. XrmToolBox tools port by extracting the Dataverse logic and rebuilding the UI from the kit.

## Non-goals

- Migrating the built-in tools onto the SDK. They stay as they are.
- Community C#, native modules, or any plugin code outside the sandbox.
- UI frameworks other than React in v1.
- A plugin using two connections at once (source and target) in v1. (my call)
- Paid plugins, licensing, or telemetry about plugins.

## Anti-goals

- A plugin that can read a token, the sidecar secret, a connection id, or a file path.
- A plugin whose colors or controls drift from the app's.
- A review queue where the owner is the bottleneck for every update.
- A second UI kit that diverges from `desktop/src/ui/shared/ui`.

## The four projects

1. **Runtime and SDK.** Sandbox, manifest, permissions, generic Dataverse API, UI kit and tokens as packages, loading a plugin from a local folder, one reference plugin.
2. **Authoring kit.** Starter repo, mock host, `powertools validate`, agent instructions and skills that build a tool end to end.
3. **Porting skills.** Power Platform ToolBox first, then XrmToolBox.
4. **Registry and plugin browser.** Registry CI, in-app browser, Community and Verified tiers, revocation.

Each project gets its own design and plan. Projects 2 to 4 are described here only as far as project 1 must not block them.

## Trust (agreed; built in projects 1 and 4)

Before listing (project 4):

- Source is public. Registry CI builds the bundle from a tagged commit and records its hash.
- The validator passes in CI.
- A new author's first submission needs one approval from a maintainer. Later updates merge automatically when CI is green.

Once installed (project 1 enforces, project 4 adds the consent screens):

- Declared permissions, enforced by the host. An update that asks for more needs fresh consent.
- No outside network unless the manifest names the host.
- The registry can revoke a version; the app disables it.

Two tiers: Community (automated checks only) and Verified (a maintainer read the code).

## Project 1: runtime and SDK

### What exists today

- A built-in tool is a React component registered through `defineTool` in `desktop/src/ui/tools/`, rendered by `desktop/src/ui/shell/tool-runtime/ToolHost.tsx`, with its own C# endpoints under `api/PowerTools/PowerTools.API/Tools/`.
- The renderer calls the sidecar over loopback through `desktop/src/ui/shared/api/client.ts`. The renderer holds the per-launch sidecar secret and the Dataverse bearer token. This is why plugin code must never share the renderer's origin or process.
- The sidecar talks to Dataverse through `ServiceClient` (`Services/DataverseClientFactory.cs`) and supports online and on-premises connections.
- Colors are CSS variables in `desktop/src/ui/styles/theme.css`, consumed as Tailwind 4 utilities (`bg-canvas`, `border-line`). Dark is the default; light is `[data-theme="light"]`.
- The UI kit is `desktop/src/ui/shared/ui` (React 19, Radix, about 20 components including `DataTable`, `Modal`, `CodeEditor`).

### Plugin package

A folder containing `powertools-tool.json` and a built bundle. (file name is my call)

Manifest fields:

| Field | Meaning |
|---|---|
| `manifestVersion` | Integer, starts at 1. |
| `id` | `publisher.tool-name`, lowercase kebab segments. Unique. |
| `name`, `description` | Shown in the shell. |
| `version` | Semver. |
| `publisher` | `{ name, url }`. |
| `icon` | Path to an SVG in the package. |
| `entry` | Path to the HTML entry file. |
| `minHostVersion` | Lowest Power Tools version it runs on. |
| `permissions` | List from the table below. |
| `messages` | Dataverse message names the plugin may execute. |
| `network` | External hosts the plugin may call. Empty by default. |
| `allowMultipleInstances` | Same meaning as for built-in tools; defaults to true. |

Permissions (names are my call):

| Permission | Allows |
|---|---|
| `data:read` | Retrieve, query, FetchXML. |
| `data:write` | Create, update, associate, disassociate. |
| `data:delete` | Delete. |
| `metadata:read` | Tables, columns, relationships, choices. |
| `metadata:write` | Create or change metadata, publish. |
| `files` | Host-run open and save dialogs. |

Executing a message needs the message name listed in `messages`. The host keeps a table that maps known messages to the permission they imply (for example `WhoAmI` to none, `PublishXml` to `metadata:write`). A message the host does not know is allowed only if listed, and is shown to the user by name at install. (my call)

### Isolation

- The main process registers a privileged custom scheme and serves each plugin's files from its folder under its own origin, for example `pt-tool://<tool-id>/`. The handler rejects any path outside the plugin folder.
- A plugin tab renders an `iframe` pointing at that origin, with the `sandbox` attribute, no preload, and no Node.
- The protocol handler sets a Content Security Policy: scripts and styles from the plugin's own origin only, no `eval`, `connect-src` limited to the manifest's `network` hosts, no navigation of the top frame.
- The plugin has no route to the sidecar: it does not know the port or the secret, and the policy blocks loopback.

**Spike first.** Before the plan is fixed, a throwaway spike must show that this frame runs in its own renderer process in the Electron version in use (39), so that an infinite loop in a plugin leaves the shell responsive, and that ES modules load under the sandboxed origin. If either fails, the fallback is one `WebContentsView` per plugin tab, positioned over the tab area, with the same protocol, policy, and message contract. The message contract below does not change between the two.

### Broker

A new shell module, `desktop/src/ui/shell/community-tools/` (location is my call), owns everything between a plugin frame and the app:

- At load it opens a `MessageChannel`, hands one port to the frame, and accepts only a handshake from the frame it created.
- Every request carries an id, a method name, and arguments. The broker checks the method against the plugin's permissions, runs it, and replies with a result or a typed error.
- Dataverse calls go through the existing `api` client using the tab's connection (`useTabConnection`), so token refresh and on-premises handling are reused.
- The broker caps in-flight calls per plugin at 4 and queues the rest. (my call)
- There is no production flag and no extra confirmation before writes. The owner dropped it on 2026-11-11.
- The protocol has a version number sent in the handshake. The host supports the current and the previous version.

The broker is the single place permissions are enforced.

A plugin plugs into the existing tab system as an ordinary `ToolDefinition` whose `component` is the frame host, so `ToolHost`, tabs, the error boundary, and per-tab connections work unchanged. Plugin definitions are added to the registry at runtime from the loaded manifests; built-in ids win on a clash.

Keyboard focus inside the frame would otherwise swallow the shell's shortcuts (switching tabs, the command palette, the primary action). The SDK listens for a fixed list of shell shortcuts sent by the host at handshake and forwards them over the port; the plugin cannot add to that list. (my call)

### SDK (`@powertools/sdk`)

A small typed package that wraps the message port. No dependencies on Electron or the desktop app.

- `connection.get()` returns `{ displayName, kind }`. No id, URL token, or secret. `connection.onChange(cb)`.
- `data.retrieve`, `data.retrieveMultiple`, `data.fetchXml` (paged, returns a continuation value), `data.create`, `data.update`, `data.delete`, `data.associate`, `data.disassociate`, `data.execute(message, parameters)`, `data.batch(operations)`.
- `metadata.tables()`, `metadata.table(name)`, `metadata.columns(name)`, `metadata.relationships(name)`, `metadata.choices(...)`.
- `shell.toast`, `shell.setStatus` (the plugin equivalent of `useToolStatus`), `shell.confirm`, `shell.openRecord` and `shell.openSolution` (routed through `useOpenInBrowser`), `shell.openFile` and `shell.saveFile` (content passes through the host; the plugin never sees a path), `shell.copyText`.
- `storage.get/set/remove`: per-plugin key-value settings, capped at 1 MB, stored under the app's user data folder. (cap is my call)
- `theme.current()` and `theme.onChange(cb)`.

Records come back as plain JSON keyed by logical name, with formatted values alongside, using the same projection the existing Fetch endpoints produce. Errors are typed: `PermissionDenied`, `NoConnection`, `DataverseFault` (with the Dataverse error code and message), `Throttled`, `Cancelled`.

### Sidecar: generic plugin API

One new folder, `api/PowerTools/PowerTools.API/Tools/CommunityToolApi/`, with generic endpoints behind the same secret and connection headers as every other endpoint: retrieve, query, FetchXML, create, update, delete, associate, disassociate, execute, batch, and the metadata reads. They contain no plugin-specific logic and do not know which plugin called. Existing metadata and fetch code is reused where it fits. Service-protection (429) responses are retried with the server's retry-after and surfaced as `Throttled` if they persist.

### UI kit and theme (`@powertools/ui`)

- `desktop/src/ui/shared/ui` and `theme.css` become a package in this repo that both the desktop app and plugins consume. There is one source; the desktop app must not keep a private copy.
- `CodeEditor` is a separate entry point so a plugin that does not use it does not pay for CodeMirror.
- The package ships a Tailwind preset so `bg-canvas` and the other token utilities work in a plugin exactly as in the app.
- At handshake, and on every theme change, the host sends the theme name and the current token values. The SDK sets `data-theme` and the CSS variables on the plugin document. The kit's stylesheet includes the default dark values so there is no unstyled flash.
- Each plugin bundles its own pinned React and kit. (my call: simpler than sharing copies across the frame boundary, and a kit update can never break an installed plugin)

### Loading a plugin from a local folder

- Settings gets a "Load community tool from folder" action. The main process reads and validates the manifest, remembers the folder, and exposes it through new typed preload methods, one per operation, as `desktop/src/electron/AGENTS.md` requires.
- A loaded plugin appears in the activity bar after the built-in tools and in the command palette, with a "Local" badge. (placement is my call; the plugin browser in project 4 will revisit it)
- Loading shows the plugin's permissions, messages, and network hosts and asks for consent. Consent is stored per plugin id and permission set.
- A manifest that fails validation is listed with its error and cannot be opened.
- A "Reload" action re-reads the folder, for authors.

### Lifecycle and performance

- Nothing about a plugin is loaded at startup except its manifest.
- The frame is created when the tab opens and destroyed when it closes. A tab that is open but not visible follows whatever `ToolHost` does for built-in tools today.
- If the handshake does not arrive within 10 seconds, the tab shows an error state with Reload. (my call)
- If the frame crashes or stops answering, the tab shows the same error state. Other tabs are unaffected.
- Project 1 logs bundle size and time-to-handshake. The budget (my call: 1.5 MB compressed without the code editor, handshake within 2 seconds) is enforced by the validator in project 2.

### Reference plugin

Attribute Explorer rebuilt as a plugin in this repo, next to the built-in one, which stays. It is read-only and exercises metadata calls, tables, a modal, status-bar content, and theme switching. It is the test fixture for the runtime and later the example in the starter repo.

### Testing

- Broker: every SDK method is refused without its permission and allowed with it; messages outside `messages` are refused; a frame other than the one created cannot handshake.
- Manifest validation: each field, bad ids, unknown permissions.
- Protocol handler: path traversal is rejected; the policy header is present.
- Sidecar: the generic endpoints, following the existing test style for tool endpoints.
- Smoke: the app loads the reference plugin from a folder, renders its table against the existing test doubles, and follows a theme switch.
- A test that a plugin frame running an infinite loop leaves the shell responsive.

### Repo rules that apply

- Follow `AGENTS.md` at the root, in `desktop/`, in `desktop/src/electron/`, and in `desktop/src/ui/tools/`.
- Record the user-visible change under `## [Unreleased]` in `CHANGELOG.md`.
- Add the new terms to `GLOSSARY.md` and record the web-only decision as an ADR in `docs/adr/`.
- Branch name: `feature/community-tool-runtime`.

### Left to the builder

- Package layout and build for `@powertools/sdk` and `@powertools/ui` inside this repo, and how the desktop app consumes the kit without a second copy.
- The exact JSON shapes of requests, results, and paging values.
- How the generic endpoints map onto `ServiceClient` calls, and which existing metadata and fetch code to reuse.
- Where remembered plugin folders, consent, and plugin storage live under user data.
- The message-to-permission table's initial contents.

