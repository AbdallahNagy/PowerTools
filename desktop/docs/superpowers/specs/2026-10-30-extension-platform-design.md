# Extension Platform Design

**Date:** 2026-10-30
**Status:** Draft for discussion

## Objective

Let community developers build, publish, and install their own tools for Power Tools without changing this repository, while keeping users' Dataverse environments safe and keeping the built-in tools as fast and reliable as they are today.

## Decision Summary

1. **Hybrid model.** Built-in tools stay in the app, are maintained in this repository, and run in-process. Community tools ship as installable **extensions** from a catalog.
2. **Dogfooding.** Built-ins move gradually onto the same public host API that extensions use, where practical. The API is proven by real tools before outside authors depend on it. Whether built-ins later become bundled extensions is deferred.
3. **Extensions are UI-only in v1.** They are a web bundle (HTML, JS, CSS) and reach Dataverse only through a host-brokered gateway. They never receive a token, the sidecar secret, Node, or raw IPC.
4. **Isolation.** Each extension tab runs in its own sandboxed Electron `WebContentsView` with its own session partition. Permission checks happen in the main process.
5. **Declared permissions.** A manifest lists what the extension needs. The user approves it at install, and again when an update asks for more.
6. **GitHub-based catalog.** A reviewed, signed JSON index in a public repository. There is no store backend in v1.
7. **No sidecar code from third parties in v1.** Backend extensions are a later phase, gated on real demand.

## Naming

Recommended: call community tools **extensions**, not plugins.

"Plugin" already means a Dataverse plug-in assembly in this product: Plugin Registration is a built-in tool, and plug-in trace logs and steps appear throughout Dataverse. "Install a plugin" would be ambiguous in support threads and search results. The counterargument is that XrmToolBox users already say "plugins". See [Open Questions](#open-questions).

This document uses **extension** throughout.

## Goals

- A community developer can build an extension with a template, test it against a fake host, run it in Developer mode, and publish it without a Power Tools release.
- A user can browse, install, update, disable, and uninstall extensions from inside the app.
- An extension cannot read credentials, reach another environment, call the network, or write to Dataverse unless the user approved that capability.
- A misbehaving extension cannot crash or freeze the app or other tabs.
- Extensions look native: same theme tokens, same controls, same status bar, same tab behavior.

## Non-Goals (v1)

- Third-party C# code in the sidecar.
- Paid extensions, licensing, or revenue sharing.
- Extensions that modify the shell (activity bar, title bar menus, other tools' tabs).
- Extensions that call other extensions.
- Moving every built-in tool into an extension.
- macOS and Linux release gates (they follow the desktop client's existing policy).

## Current Baseline

- Built-in tools are registered at build time in `src/ui/tools/registry.tsx` through `defineTool` (`id`, `title`, `icon`, `component`, `showInActivityBar`, `allowMultipleInstances`).
- Each tool has a React folder in `src/ui/tools/<tool>/` and C# endpoints in `api/PowerTools/PowerTools.API/Tools/<Tool>/`. These are wired up by hand in `Program.cs`.
- Tools use `shared/ui`, `shared/status`, `shared/connections`, `shared/keyboard`, and `shared/contracts/dataverse`. None of these are versioned for outside use.
- The renderer gets the active connection's bearer token from `desktopBridge.getActiveConnection()`, and the sidecar URL and per-launch secret from `desktopBridge.getLocalSecret()`. It sends them to the sidecar as `Authorization` / `X-Environment-Url` headers (`shared/api/client.ts`, `DataverseContextFilter.cs`).
- The renderer CSP allows only `'self'` and the loopback sidecar, with `frame-src 'none'` (`contentSecurityPolicy.ts`).

### Consequence for extensions

Anything running in the main renderer can read the bearer token and the sidecar secret, and act as the user against every connected environment. Third-party code must never run in the main renderer, including inside an iframe that shares its origin.

## Threat Model

Users connect Power Tools to production environments, often as System Administrators. Assume an extension may be:

- **Malicious:** written to exfiltrate data or tokens, or to modify records.
- **Compromised:** a legitimate extension whose author's account or dependency was hijacked, followed by a malicious update.
- **Buggy:** an infinite loop, a runaway request loop, a memory leak, or an unintended destructive write.

What we protect:

| Asset | Protection |
| --- | --- |
| Bearer tokens, refresh tokens, stored credentials | Never sent to extension processes. The main process attaches them when brokering. |
| Sidecar URL and secret | Never sent to extension processes. |
| Other environments | An extension sees only the connection bound to its tab, which the user picks in the shell. |
| Dataverse data integrity | Writes need the `dataverse.write` permission. Host-rendered confirmation is available for destructive operations. |
| User data leaving the machine | No network access unless the user approved listed origins. Enforced per session in the main process. |
| Local files | Only through host file dialogs the user drives. |
| App stability | Separate renderer process per extension view. Host can kill and reload it. |

Out of scope: a user who knowingly enables Developer mode and sideloads an unsigned extension. They are warned clearly.

## Architecture

```
┌─────────────── Main window (trusted renderer) ───────────────┐
│ Shell: activity bar · tabs · status bar · connection picker  │
│ Built-in tools (in-process React)                            │
│ ┌──────── Extension tab placeholder (layout only) ────────┐  │
│ │ ╔═══ WebContentsView (sandboxed, partition per ext) ══╗ │  │
│ │ ║ Extension bundle + @powertools/extension-sdk        ║ │  │
│ │ ╚══════════════════════╤══════════════════════════════╝ │  │
│ └────────────────────────┼────────────────────────────────┘  │
└──────────────────────────┼───────────────────────────────────┘
                           │ MessagePort RPC (preload exposes only this)
                 ┌─────────▼──────────┐
                 │ Main process       │  ExtensionBroker:
                 │                    │  • identifies caller by webContents id
                 │                    │  • checks manifest permissions
                 │                    │  • resolves the tab's connection + token
                 └─────────┬──────────┘
                           │ loopback + secret + Authorization
                 ┌─────────▼──────────┐
                 │ Sidecar            │  /api/extension-gateway/*
                 │ Dataverse clients  │  (ServiceClient online, OnPremiseClient on-prem)
                 └─────────┬──────────┘
                           ▼
                       Dataverse
```

### Extension view

- Each extension tab is a `WebContentsView` placed over the tab's content area. The shell renders a placeholder element and reports its bounds to the main process on resize, tab switch, and window state changes.
- `webPreferences`: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`, `partition: "persist:ext-<extensionId>"`, and an extension-specific preload that exposes one `MessagePort` and nothing else.
- Content is served from a custom `ptext://<extensionId>/` protocol registered with `protocol.handle`. It serves only files from the installed extension folder and sets a strict CSP header: `default-src 'self'; connect-src 'none'` plus approved network origins; `frame-src 'none'`; `object-src 'none'`.
- `will-navigate`, `setWindowOpenHandler`, and `will-attach-webview` deny everything. Links go through `host.ui.openExternal`.
- The session's `webRequest.onBeforeRequest` blocks every request except `ptext://<extensionId>/` and approved network origins. This makes CSP defense in depth rather than the only control.
- The shell forwards global shortcuts (tab switching, command palette) from the view so keyboard behavior matches built-ins.
- When the view crashes or stops responding, the tab shows an error state with Reload, like `ToolErrorBoundary`.

**Alternative considered: a sandboxed `<iframe>` in the main renderer** served from `ptext://`. Layout, focus, and theming are simpler. Isolation is weaker: it shares the main renderer's session, and whether it runs out of process depends on site-isolation behavior we would need to verify. The broker stays in the main process either way, so if the phase 3 spike finds `WebContentsView` layout or focus too costly, we can switch to an iframe without changing the permission model or the SDK.

### Host API and SDK

Extensions depend on `@powertools/extension-sdk` (npm). It wraps the `MessagePort` RPC in typed async functions. The host API has its own semver version, independent of the app version.

| Namespace | v1 functions | Permission |
| --- | --- | --- |
| `host.connection` | `current()` returns `{ displayName, envUrl, crmType, orgVersion }` or `null`; `onChange(cb)`; `requestChange()` opens the shell's picker | none |
| `host.dataverse` | `webApi({ method, path, query, body, headers, signal })` for paths under `/api/data/v9.x/` (online connections only in v1; see [Sidecar gateway](#sidecar-gateway)); `fetchXml(fetchXml, { page, pagingCookie })`; `whoAmI()` | `dataverse.read`; any non-GET or `$batch` needs `dataverse.write` |
| `host.status` | `set(items)`, `clear()`. Same model as `useToolStatus`, scoped to the tab. | none |
| `host.ui` | `toast(...)`, `confirm({ title, message, destructive })` rendered by the host, `openRecord(entitySetName, id)` and `openDataversePage(path)` in the connection's browser and profile, `openExternal(url)` | `openExternal` needs `externalLinks` |
| `host.theme` | `current()`, `onChange(cb)`. The host also injects theme CSS variables into the view. | none |
| `host.storage` | `get`, `set`, `delete`, `keys`. Per extension, JSON values, 5 MB quota. | none |
| `host.files` | `saveFile({ suggestedName, content })`, `openFile({ filters })` through host dialogs | `files` |
| `host.clipboard` | `writeText(text)` | none |
| `host.tab` | `setTitle(suffix)`, `onClose(cb)` for cleanup | none |

Rules the broker enforces:

- The caller's identity comes from the `webContents` that owns the port, never from a value in the message.
- `host.dataverse` always targets the connection bound to the calling tab. There is no parameter to choose another environment.
- `GET` requests and FetchXML are reads. Any other method, and every `$batch`, is a write.
- Per extension: at most 8 Dataverse requests in flight, default 120-second timeout, response size capped (initially 50 MB), all cancelable through `signal`.
- Tokens, the sidecar secret, and raw sidecar error stacks never appear in responses.

Multi-connection tools (source and target, like Data Migration) are out of scope for v1. A later `host.connection.requestSecondary()` can follow the shell's existing target-connection model.

### Sidecar gateway

New endpoints in `api/PowerTools/PowerTools.API/Tools/ExtensionGateway/`, protected by the existing secret gate and `DataverseContextFilter`:

- `POST /api/extension-gateway/webapi`: `{ method, path, query, headers, body }`. Validates that the path is relative to the Web API root and runs through `ServiceClient.ExecuteWebRequest`. Returns `{ status, headers (allow-listed), body }`. **Online only in v1.** On-premises connections use the Data8 `OnPremiseClient` over SOAP `Organization.svc` (`DataverseClientFactory.CreateOnPremises`), which has no Web API path. For those connections the gateway returns a clear "not supported for on-premises connections" error.
- `POST /api/extension-gateway/fetchxml`: FetchXML with paging through `IOrganizationService.RetrieveMultiple`. Works for online and on-premises connections.
- `POST /api/extension-gateway/whoami`: `WhoAmIRequest` through `IOrganizationService`. Works for online and on-premises connections.

Extensions that must support on-premises should stay within `fetchXml` and `whoAmI` in v1. The manifest can declare `"requires": { "connection": ["online"] }`, and the host then hides the extension's tab for on-premises connections and shows why.

Only the main-process broker calls these endpoints. The renderer and built-in tools keep their existing endpoints.

### UI kit and theming

- Extract `src/ui/shared/ui` and the theme tokens into a workspace package, `@powertools/ui`, and publish it. Built-ins import it from the workspace and extensions bundle it.
- Theme colors are CSS variables supplied by the host. The variable names are the stable contract, so an extension built against an older `@powertools/ui` still follows the current theme.
- Follow `desktop/.agents/skills/ui-colors/SKILL.md` for token names. Do not add extension-only tokens.

### Manifest

Each package has a `manifest.json` at its root:

```json
{
  "manifestVersion": 1,
  "id": "contoso.audit-history-explorer",
  "name": "Audit History Explorer",
  "version": "1.2.0",
  "publisher": "contoso",
  "description": "Browse and export audit history for any record.",
  "icon": "icon.svg",
  "entry": "dist/index.html",
  "engines": { "powertools-host": "^1.0.0" },
  "permissions": ["dataverse.read", "files"],
  "network": [],
  "allowMultipleInstances": true,
  "categories": ["Data", "Auditing"],
  "repository": "https://github.com/contoso/pt-audit-history",
  "license": "MIT"
}
```

- `id` is `<publisher>.<name>`, lowercase kebab segments, and is never reused once published.
- `engines.powertools-host` is checked against the host API version. Incompatible extensions are listed but cannot be installed or enabled.
- `network` lists exact HTTPS origins, for example `"https://api.contoso.com"`. Wildcards are not allowed in v1.

Permissions in v1: `dataverse.read`, `dataverse.write`, `files`, `externalLinks`. `network` is shown to the user as its own permission line listing each origin.

### Package format

- A `.ptext` file is a zip containing `manifest.json`, the built bundle, the icon, `README.md`, and `LICENSE`.
- Maximum package size is 25 MB in v1.
- No executable or native files (`.exe`, `.dll`, `.node`, `.ps1`, and similar). The installer rejects them.

### Install, update, and uninstall

- Install location: `<userData>/extensions/<id>/<version>/`. Settings and storage live in `<userData>/extensions-data/<id>/`.
- Install:
  1. Download the package.
  2. Verify its SHA-256 against the signed catalog.
  3. Validate the manifest.
  4. Show the consent screen with the permissions in plain language.
  5. Extract the package.
  6. Register the extension with the tool registry.
- Updates are checked at startup and every 24 hours. Updates that need no new permissions install in the background and apply the next time the tab opens. Updates that add permissions wait for the user's approval.
- Disable keeps files and storage. Uninstall removes both after confirmation.
- Kill switch: the catalog can mark versions or whole extensions `revoked`. The host disables them at the next catalog refresh, closes their tabs, and tells the user why.

### Registry integration

- `ToolDefinition` gains `kind: "builtin" | "extension"`. `createToolRegistry` merges the built-in list with enabled extensions at runtime.
- An extension's `component` is a shared `ExtensionToolHost` that owns the placeholder and view lifecycle.
- The activity bar shows extensions after built-ins with a small marker. The welcome page lists installed extensions separately from `publicCatalog.ts` (built-ins only).
- Duplicate IDs: built-ins always win. An extension ID that collides with a built-in is rejected at install.

### Catalog

- A public repository, for example `AbdallahNagy/powertools-extensions`, with one folder per extension and a generated `index.json`.
- Authors publish a version by opening a pull request that adds a version entry pointing to a GitHub release asset in their own repository, with its SHA-256.
- CI on the catalog repository:
  - validates the manifest schema and that the `id` matches the publisher;
  - downloads the package and checks its hash and size;
  - checks that it contains no forbidden files;
  - flags `eval`, `new Function`, remote script tags, and obfuscated bundles for a human reviewer;
  - requires human review for any extension that requests `dataverse.write` or `network`.
- When a pull request is merged, CI signs `index.json` with an Ed25519 key held as a repository secret. The app embeds the public key and rejects an index whose signature fails to verify.
- Each version entry records the repository and commit it was built from. Reproducible builds are a later goal, not a v1 requirement.
- The in-app catalog reads `index.json` and each extension's README. The website can render the same index later.

### Developer mode

- A setting, off by default, that enables **Load extension from folder**.
- Sideloaded extensions run in the same sandbox with the same permission prompts, but carry an "Unverified" badge.
- To support hot reload, Developer mode can point an extension at a `http://localhost:<port>` dev server. That origin is allowed only for sideloaded extensions while Developer mode is on.
- `@powertools/extension-sdk/testing` provides a fake host with in-memory Dataverse fixtures, so authors can test without organization credentials. This follows the same rule as this repository's own tests.

### Authoring experience

- `npm create powertools-extension` scaffolds a Vite + React + TypeScript project with the SDK, `@powertools/ui`, the fake host, a sample test, and a GitHub Actions workflow that builds the `.ptext` and attaches it to a release.
- The template can include an adapted version of the tool-building pipeline from `desktop/docs/tool-building-pipeline.md` (research an XrmToolBox plugin, Dataverse review, UX, develop, review), so authors get the same agent-assisted workflow used for built-ins.
- Documentation lives on the website: getting started, host API reference, permissions guide, review checklist, and design guidelines.

### Versioning and compatibility

- The host API follows semver. Minor versions only add things. A function removed in a major version stays deprecated for at least one minor release, with a console warning in Developer mode.
- The app supports the current host API major version and the previous one.
- The manifest format has its own `manifestVersion`.

### Diagnostics

- Errors from an extension view never go to the app's Sentry project. They show in the tab's error state and in an extension log the user can open and copy.
- An **Activity** panel per extension lists recent Dataverse calls: method, path, status, and time. This lets users see what an extension did.

## Built-in Dogfooding

- Add a facade at `src/ui/shared/host/` with the same shapes as the host API (`connection`, `dataverse`, `status`, `ui`, `storage`). Built-ins keep calling in-process, so there is no `WebContentsView` and no broker.
- Pilot by moving one small, read-only built-in (for example Workflow Activities Viewer or FetchXML Tester) so that it uses only the facade and generic Dataverse access. Whatever it still needs from `shared/` beyond that is a gap in the host API.
- New built-ins should prefer the facade. Built-ins with heavy sidecar logic (Data Migration, Translator, Plugin Registration) keep their endpoints. They are not candidates for becoming extensions until backend extensions exist.

## Backend Extensions (later)

Consider this only once there are listed extensions that cannot be built on the gateway. Options to evaluate then:

1. A separate process per extension (for example a .NET or Node executable) that talks to the host over stdio, with the same brokered Dataverse access. This keeps isolation, but needs signed binaries and per-OS builds.
2. Loading assemblies into the sidecar with `AssemblyLoadContext`. This is the simplest to build, but it means full trust, Dataverse SDK version coupling, and the sidecar's credentials in reach. It is not recommended.

## Phases

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| 1. Design | This document; manifest JSON schema; host API TypeScript definitions; community feedback | Schema and API types merged; naming decided |
| 2. Dogfood | `shared/host` facade; extension gateway endpoints in the sidecar; one pilot built-in on the facade; `@powertools/ui` extracted | Pilot ships with no change in behavior; gaps in the API are documented |
| 3. Sideloading | `WebContentsView` host, `ptext://` protocol, broker, permissions, Developer mode, SDK and fake host, template | Two or three invited community developers each ship a working extension; isolation spike written up |
| 4. Catalog | Catalog repository and CI, signing, in-app browse/install/update/uninstall, consent screens, kill switch, Activity panel | Public beta with reviewed extensions; a revoked version is disabled end to end in a test |
| 5. Grow | Website catalog pages, secondary connections, more host APIs, then backend extensions if demand is shown | Driven by requests from extension authors |

## Testing

- Unit tests for the manifest validator, permission classification (read vs write, `$batch`), path validation, and catalog signature verification.
- Broker tests with a fake sidecar: denied permissions, a tab bound to another connection, rate limits, cancellation, and stripping of the token and secret.
- Playwright tests with a fixture extension that tries to: read `window.electron`, call the sidecar directly, `fetch` an unapproved origin, navigate the view, open a window, and write without permission. Each attempt must fail.
- Sidecar tests for `/api/extension-gateway/*` using deterministic fakes, with no production credentials.

## Open Questions

1. **Name:** extensions (recommended) or plugins?
2. **Catalog review:** who reviews extensions, and what is the turnaround target? Is there a "verified publisher" tier?
3. **Production guard:** should the host require a host-rendered confirmation before any extension write when the connection is marked as production?
4. **Telemetry:** should extensions get an opt-in usage-count API, or should the catalog only track installs?
5. **Licensing:** must catalog extensions be open source, or is a public repository with any license enough?
6. **On-premises Web API:** should a later version add a Web API path for on-premises connections (AD or IFD authentication from the sidecar), or a generic SDK `Execute` over `IOrganizationService` that works everywhere?
7. **Built-in future:** after phase 4, should built-ins with no sidecar endpoints be shipped as bundled extensions?
