# Community Tool Runtime and SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Power Tools load a community tool (a sandboxed web bundle) from a local folder, give it a permissioned Dataverse and shell API through an SDK, and make it look native through a shared UI kit package.

**Architecture:** The main process serves each tool's files under its own `pt-tool://<tool-id>/` origin. A tool tab hosts a sandboxed `iframe`; a broker in the renderer shell talks to it over a `MessagePort`, checks permissions, and calls new generic sidecar endpoints through the existing `api` client. The SDK and UI kit are packages in this repo; the UI kit package builds from `desktop/src/ui/shared/ui` so there is one source.

**Tech Stack:** Electron 39, React 19, TypeScript 5.8, Vite 6, Vitest 4, Playwright, Tailwind 4, ASP.NET Core (.NET 9) with `Microsoft.PowerPlatform.Dataverse.Client`, xUnit.

**Spec:** `docs/superpowers/specs/2026-11-11-plugin-system-design.md`. Read it before any task.

**Execution:** Subagent-driven. Implementation subagents run on model `opus` at `medium` effort (owner's instruction).

## Global Constraints

- The feature is called **community tool**. The word "plugin" must not appear for this feature in UI text, file names, package names, the URL scheme, docs, or code identifiers. ("Plugin Registration" is an unrelated built-in tool; leave it alone.)
- Community tools are web-only. No community code runs in the sidecar or the main process.
- A community tool never receives a token, the sidecar secret, a connection id, an environment URL, or a file path.
- Built-in tools are not migrated and their behavior must not change.
- Follow `AGENTS.md` at the root, `desktop/AGENTS.md`, `desktop/src/electron/AGENTS.md`, `desktop/src/ui/tools/AGENTS.md`. In particular: one typed preload method per operation; renderer code reaches Electron only through `desktop/src/ui/platform/desktopBridge.ts`; validate IPC inputs.
- Colors come from theme tokens only (`desktop/.agents/skills/ui-colors/SKILL.md`).
- Manifest file name: `powertools-tool.json`. Scheme: `pt-tool`. Protocol version: `1`.
- Limits: 4 in-flight calls per tool; tool storage capped at 1 MB; handshake timeout 10 seconds.
- Branch: `feature/community-tool-runtime`, cut from `main`. Commit after every task. Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Before a task is done, from `desktop/`: `npm run typecheck`, `npm run lint -- --max-warnings 0`, `npm test`. For sidecar tasks, from `api/PowerTools/`: `dotnet test`.

## Deviations from the spec (decided while planning)

- **No production confirmation.** The owner dropped it. There is no production flag, no `isProduction`, and no extra confirmation before writes.
- **Where "Load community tool from folder" lives.** The app has no Settings screen. The action goes in the File title-bar menu and the command palette, and opens a "Community tools" manager dialog.
- **`data.retrieveMultiple`** is compiled to FetchXML inside the SDK. The sidecar gets no separate query endpoint.
- **Manifest validation** lives in the main process for now (`desktop/src/electron/communityTools/manifest.ts`), because the Electron build cannot import from `packages/`. Project 2 moves it into the validator.

## Review Focus

1. **A remembered tool folder was moved or deleted.** The app starts normally; the tool is listed in the manager with "Folder not found" and cannot be opened. (Task 4)
2. **The tab has no connection, or the connection changes during a call.** Data calls fail with `NoConnection`; `connection.onChange` fires with the new snapshot. (Task 7)
3. **The tab closes while calls are in flight.** Late results are dropped; nothing throws; the port is closed. (Task 7)
4. **The frame sends garbage.** A non-object, an unknown method, or a missing id gets an `InvalidRequest` reply or is ignored; the broker keeps serving. (Task 7)
5. **Two folders declare the same tool id, or an id equal to a built-in tool id.** The second is rejected with "A tool with id … is already loaded". (Task 4)

## File Structure

```
packages/
  sdk/                      @powertools/sdk: protocol types, client, handshake, theme, shortcuts
  ui/                       @powertools/ui: build wrapper over desktop/src/ui/shared/ui + theme.css
  reference-tool/           Attribute Explorer as a community tool
desktop/src/electron/communityTools/
  manifest.ts               parse and validate powertools-tool.json
  toolStore.ts              remembered folders, consent, per-tool storage (user data)
  toolProtocol.ts           pt-tool:// scheme and file handler
  toolIpc.ts                IPC handlers
desktop/src/ui/shell/community-tools/
  permissions.ts            method -> permission, message table, authorize()
  broker.ts                 request loop, concurrency cap, production confirm
  hostServices.ts           broker services backed by the app (api client, toasts, ...)
  CommunityToolFrame.tsx    iframe, handshake, timeout, error state
  CommunityToolsProvider.tsx  loaded tools -> ToolDefinitions
  CommunityToolsDialog.tsx  manager: load, consent, reload, remove
api/PowerTools/PowerTools.API/Tools/CommunityToolApi/
api/PowerTools/PowerTools.API.CommunityToolApi.Tests/
```

---

### Task 1: Isolation spike (throwaway, decision gate)

**Files:**
- Create: `desktop/spike/community-tool-isolation/` (deleted at the end of this task)
- Modify: `docs/superpowers/specs/2026-11-11-plugin-system-design.md` (append a "Spike result" section)

No tests, no production code. This task answers three questions on Electron 39.

- [ ] **Step 1: Build a minimal Electron app in the spike folder.** It registers `pt-tool` with `protocol.registerSchemesAsPrivileged([{ scheme: "pt-tool", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])`, serves a folder through `protocol.handle`, and loads a host page containing `<iframe sandbox="allow-scripts" src="pt-tool://spike.tool/index.html">`. The host page shows a counter that increments every 100 ms. The framed page loads an ES module from its own origin and has a button that runs `while (true) {}`.

- [ ] **Step 2: Answer and record.**
  1. Does the framed page's ES module load under `sandbox="allow-scripts"` (opaque origin)? If not, which response headers fix it (`Access-Control-Allow-Origin: *`)?
  2. With the loop running, does the host counter keep incrementing? Check `app.getAppMetrics()` or `webContents.mainFrame.framesInSubtree` process ids to confirm the frame has its own process.
  3. Does a `MessagePort` transferred with `iframe.contentWindow.postMessage(msg, "*", [port])` arrive in the frame?

- [ ] **Step 3: Write the answers** under `## Spike result` in the spec, delete the spike folder, commit.

**Gate:** If answer 2 is "no" (the shell freezes), STOP and report to the controller. Tasks 5 and 8 assume an `iframe`; the fallback (`WebContentsView` per tab) needs those two tasks rewritten before work continues. All other tasks are unaffected.

---

### Task 2: SDK package

**Files:**
- Create: `packages/sdk/package.json` (name `@powertools/sdk`, version `0.1.0`, `type: module`, scripts `build` (vite lib mode, ES output + `.d.ts`), `test` (vitest), `typecheck`)
- Create: `packages/sdk/src/protocol.ts`, `packages/sdk/src/client.ts`, `packages/sdk/src/connect.ts`, `packages/sdk/src/fetchXmlQuery.ts`, `packages/sdk/src/index.ts`
- Test: `packages/sdk/tests/client.test.ts`, `packages/sdk/tests/connect.test.ts`, `packages/sdk/tests/fetchXmlQuery.test.ts`

**Interfaces — Produces** (`protocol.ts`; every later task uses these exact names):

```ts
export const PROTOCOL_VERSION = 1;
export const CONNECT_MESSAGE = "pt-tool:connect";

export const PERMISSIONS = ["data:read","data:write","data:delete","metadata:read","metadata:write","files"] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const METHODS = [
  "connection.get",
  "data.retrieve","data.fetchXml","data.create","data.update","data.delete",
  "data.associate","data.disassociate","data.execute","data.batch",
  "metadata.tables","metadata.table","metadata.columns","metadata.relationships","metadata.choices",
  "shell.toast","shell.setStatus","shell.confirm","shell.openRecord","shell.openSolution",
  "shell.openFile","shell.saveFile","shell.copyText","shell.shortcut",
  "storage.get","storage.set","storage.remove",
] as const;
export type MethodName = (typeof METHODS)[number];

export type ErrorCode = "PermissionDenied"|"NoConnection"|"DataverseFault"|"Throttled"|"Cancelled"|"InvalidRequest"|"Internal";
export interface ToolError { code: ErrorCode; message: string; dataverseCode?: number }

export interface ToolRequest { id: number; method: MethodName; args: unknown }
export type ToolResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: ToolError };

export interface ConnectionSnapshot { displayName: string; kind: "online"|"onpremise" }
export interface ThemeSnapshot { name: "dark"|"light"; tokens: Record<string, string> }  // "--color-canvas" -> value
export interface ShortcutSpec { key: string; code?: string; ctrl: boolean; shift: boolean }

export interface ReadyMessage { type: "ready"; protocolVersion: number; theme: ThemeSnapshot; connection: ConnectionSnapshot | null; shortcuts: ShortcutSpec[] }
export type HostEvent =
  | { type: "event"; event: "theme"; theme: ThemeSnapshot }
  | { type: "event"; event: "connection"; connection: ConnectionSnapshot | null };

export interface EntityRef { logicalName: string; id: string; name?: string }
export interface DataRecord { logicalName: string; id: string; values: Record<string, unknown>; formatted: Record<string, string> }
export interface FetchPage { records: DataRecord[]; moreRecords: boolean; pagingCookie: string | null; page: number }
export type BatchOperation =
  | { op: "create"; table: string; values: Record<string, unknown> }
  | { op: "update"; table: string; id: string; values: Record<string, unknown> }
  | { op: "delete"; table: string; id: string };
```

Value encoding inside `values` and execute parameters: strings, numbers, booleans, and `null` are plain; a lookup is `{ "$type": "EntityReference", logicalName, id, name? }`; also `{ "$type": "OptionSetValue", value }`, `{ "$type": "Money", value }`, `{ "$type": "DateTime", value: ISO-8601 }`, `{ "$type": "Guid", value }`, `{ "$type": "OptionSetValueCollection", values: number[] }`.

`client.ts`: `export function createClient(port: MessagePort, ready: ReadyMessage): PowerToolsClient` where `PowerToolsClient` has `connection`, `data`, `metadata`, `shell`, `storage`, `theme` namespaces with one function per method in the spec's SDK list. Rejections are `ToolClientError extends Error` carrying `code` and `dataverseCode`.

`connect.ts`: `export function connect(options?: { timeoutMs?: number }): Promise<PowerToolsClient>`. It waits for a `message` event from `window.parent` whose data is `{ type: CONNECT_MESSAGE }` with one transferred port, posts `{ type: "hello", protocolVersion: PROTOCOL_VERSION }` on it, waits for `ReadyMessage`, applies the theme (sets `document.documentElement.dataset.theme` and each token with `style.setProperty`), installs a `keydown` listener that, for a key matching a `ShortcutSpec`, calls `preventDefault()` and sends `shell.shortcut` with `{ key, code, ctrlKey, shiftKey }`, then resolves. It re-applies the theme to the document on every later `theme` event.

`fetchXmlQuery.ts`: `export function buildFetchXml(table: string, query: { select?: string[]; filter?: Array<{ column: string; operator: "eq"|"ne"|"like"|"null"|"not-null"|"in"; value?: unknown }>; orderBy?: Array<{ column: string; descending?: boolean }>; top?: number }): string`. All names and values are XML-escaped.

- [ ] **Step 1: Write failing tests.** Using a real `MessageChannel` (Node has one):
  - `client.test.ts`: `data.retrieve("account","<guid>",["name"])` posts `{ id: 1, method: "data.retrieve", args: { table: "account", id: "<guid>", columns: ["name"] } }`; an `ok: true` reply resolves with `result`; an `ok: false` reply rejects with `ToolClientError` whose `code` matches; two concurrent calls resolve to their own ids when replies arrive in reverse order; a reply with an unknown id is ignored; a `HostEvent` of `theme` calls `theme.onChange` listeners; `connection.onChange` likewise.
  - `connect.test.ts` (jsdom): a connect message from a window other than `window.parent` is ignored; `ready` with `protocolVersion: 2` rejects with "Unsupported host protocol 2"; no connect message within `timeoutMs` rejects; after `ready`, `document.documentElement.dataset.theme` equals the snapshot name and `--color-canvas` is set.
  - `fetchXmlQuery.test.ts`: `buildFetchXml("account", { select: ["name"], top: 5 })` equals `<fetch top="5"><entity name="account"><attribute name="name" /></entity></fetch>`; a filter value `a"<b` is escaped; `in` with `[1,2]` produces two `<value>` elements.
- [ ] **Step 2: Run** `npm test` in `packages/sdk`; expect failures.
- [ ] **Step 3: Implement** the four source files.
- [ ] **Step 4: Run** `npm test` and `npm run build`; expect pass and a `dist/` with `index.js` and `index.d.ts`.
- [ ] **Step 5: Commit** `feat(sdk): add community tool SDK and protocol`.

---

### Task 3: Manifest validation

**Files:**
- Create: `desktop/src/electron/communityTools/manifest.ts`
- Test: `desktop/test/electron/communityToolManifest.test.ts`

**Interfaces — Produces:**

```ts
export interface CommunityToolManifest {
  manifestVersion: 1;
  id: string; name: string; description: string; version: string;
  publisher: { name: string; url?: string };
  icon: string; entry: string; minHostVersion: string;
  permissions: string[];   // each one of PERMISSIONS
  messages: string[]; network: string[];
  allowMultipleInstances: boolean;  // default true
}
export type ManifestResult = { ok: true; manifest: CommunityToolManifest } | { ok: false; errors: string[] };
export function parseManifest(json: unknown, hostVersion: string): ManifestResult;
export const MANIFEST_PERMISSIONS: readonly string[];
```

Rules: `id` matches `^[a-z0-9]+(-[a-z0-9]+)*\.[a-z0-9]+(-[a-z0-9]+)*$`; `version` and `minHostVersion` are `x.y.z`; `minHostVersion` must be `<= hostVersion`; `icon` ends in `.svg`; `icon` and `entry` are relative, contain no `..` segment and no backslash; `messages` entries match `^[A-Za-z_][A-Za-z0-9_]*$`; `network` entries are bare host names (no scheme, path, or `*`); unknown permission names are errors; unknown top-level fields are ignored. All errors are collected, not just the first.

- [ ] **Step 1: Write failing tests:** a valid manifest returns `ok: true` with `allowMultipleInstances` defaulted to `true`; each rule above has one failing input and asserts its error text mentions the field; a manifest with three problems returns three errors; `MANIFEST_PERMISSIONS` deep-equals `PERMISSIONS` imported from `../../../packages/sdk/src/protocol`.
- [ ] **Step 2: Run** `npx vitest run test/electron/communityToolManifest.test.ts` from `desktop/`; expect fail.
- [ ] **Step 3: Implement.** No new dependency; hand-written checks.
- [ ] **Step 4: Run** the test; expect pass.
- [ ] **Step 5: Commit** `feat(desktop): validate community tool manifests`.

---

### Task 4: Tool store and IPC

**Files:**
- Create: `desktop/src/electron/communityTools/toolStore.ts`, `desktop/src/electron/communityTools/toolIpc.ts`
- Modify: `desktop/src/electron/main.ts` (compose only), `desktop/src/electron/preloadApi.cts`, `desktop/src/ui/platform/desktopBridge.ts`, `desktop/test/support/desktopBridge.ts`
- Test: `desktop/test/electron/communityToolStore.test.ts`, `desktop/test/electron/communityToolIpc.test.ts`; extend `desktop/test/electron/preloadApi.test.ts` and `desktop/test/renderer/desktopBridge.test.ts`

**Interfaces — Consumes:** `parseManifest`, `CommunityToolManifest` (Task 3).

**Produces:**

```ts
// toolStore.ts — all file access injected for tests
export interface LoadedCommunityTool {
  id: string;                       // manifest id, or the folder path when the manifest is unreadable
  folder: string;
  status: "ready" | "invalid" | "missing";
  errors: string[];
  manifest: CommunityToolManifest | null;
  iconDataUrl: string | null;       // data:image/svg+xml;base64,...
  consentGranted: boolean;          // true when stored consent hash matches the current permission set
}
export function createToolStore(deps: { userDataPath: string; hostVersion: string; builtInToolIds: readonly string[]; fs: ToolStoreFs }): {
  list(): Promise<LoadedCommunityTool[]>;
  addFolder(folder: string): Promise<LoadedCommunityTool>;
  remove(id: string): Promise<void>;
  grantConsent(id: string): Promise<void>;
  folderFor(id: string): string | null;          // used by the protocol handler
  manifestFor(id: string): CommunityToolManifest | null;
  readStorage(id: string): Promise<Record<string, unknown>>;
  writeStorage(id: string, data: Record<string, unknown>): Promise<void>;  // rejects above 1 MB serialized
};
```

State file: `<userData>/community-tools.json` holding `{ folders: string[], consent: Record<toolId, string> }`. The consent value is a SHA-256 of the sorted `permissions`, `messages`, and `network` lists. Tool storage: `<userData>/community-tool-data/<tool-id>.json`.

Preload methods (channel names are the kebab-case form): `listCommunityTools()`, `addCommunityToolFromFolder()` (shows a folder picker; returns `LoadedCommunityTool | null`), `removeCommunityTool(id)`, `grantCommunityToolConsent(id)`, `readCommunityToolStorage(id)`, `writeCommunityToolStorage(id, data)`, `openFileForCommunityTool(id, filters)` (returns `{ name: string; content: string } | null`), `saveFileForCommunityTool(id, suggestedName, content)` (returns `boolean`). The renderer never receives a path from the file methods. Every handler checks the sender is the main window and that `id` is a loaded tool.

- [ ] **Step 1: Write failing store tests** with an in-memory `fs`: `addFolder` of a valid folder returns `status: "ready"`, `consentGranted: false`; after `grantConsent`, `list()` shows `true`; changing the manifest's `permissions` flips it back to `false`; a folder without a manifest is `invalid` with "powertools-tool.json not found"; a remembered folder that no longer exists is `missing` with "Folder not found" and `list()` still resolves (Review Focus 1); a second folder with the same id rejects with `A tool with id "x.y" is already loaded`, and so does an id in `builtInToolIds` (Review Focus 5); `writeStorage` with a 1.1 MB value rejects with "Tool storage is limited to 1 MB"; a corrupt `community-tools.json` is treated as empty.
- [ ] **Step 2: Write failing IPC tests** following the fake-`ipcMain` style in `desktop/test/electron/` (read `connectionIpc.ts` and its tests first): a call from a non-main-window sender is refused; `openFileForCommunityTool` returns name and content, never a path; `saveFileForCommunityTool` for an unknown id is refused.
- [ ] **Step 3: Run** both test files; expect fail.
- [ ] **Step 4: Implement** store, IPC, preload methods, and bridge methods. Register in `main.ts` by composition only.
- [ ] **Step 5: Run** `npm test` from `desktop/`; expect pass.
- [ ] **Step 6: Commit** `feat(desktop): remember and manage community tool folders`.

---

### Task 5: `pt-tool://` protocol

**Files:**
- Create: `desktop/src/electron/communityTools/toolProtocol.ts`
- Modify: `desktop/src/electron/main.ts` (register the scheme before `app.whenReady`, install the handler after), `desktop/contentSecurityPolicy.ts`, `desktop/test/contentSecurityPolicy.test.ts`
- Test: `desktop/test/electron/communityToolProtocol.test.ts`

**Interfaces — Consumes:** `folderFor`, `manifestFor` (Task 4). Spike result (Task 1) for the exact privileges and headers.

**Produces:**

```ts
export const TOOL_SCHEME = "pt-tool";
export function toolPolicy(manifest: Pick<CommunityToolManifest, "network">): string;
export function resolveToolRequest(url: string, deps: { folderFor(id: string): string | null; manifestFor(id: string): CommunityToolManifest | null; readFile(path: string): Promise<Buffer> }): Promise<{ status: number; headers: Record<string, string>; body: Buffer | null }>;
export function registerToolScheme(): void;   // registerSchemesAsPrivileged
export function installToolProtocol(deps): void; // protocol.handle
```

`toolPolicy` returns: `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src <'none' or https://host for each network entry>; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-src 'none'`. If the spike showed `'self'` does not match under an opaque origin, use `pt-tool://<tool-id>` in its place.

Renderer policy: `frame-src` changes from `'none'` to `pt-tool:`.

- [ ] **Step 1: Write failing tests:** `pt-tool://acme.demo/index.html` returns 200, `Content-Type: text/html`, a `Content-Security-Policy` header equal to `toolPolicy(manifest)`, and `Access-Control-Allow-Origin: *`; `.js` is `text/javascript`, `.css` is `text/css`, `.svg` is `image/svg+xml`, `.json` is `application/json`, `.woff2` is `font/woff2`; `pt-tool://acme.demo/../secret.txt`, `pt-tool://acme.demo/%2e%2e/secret.txt`, and `pt-tool://acme.demo/a/..%5c..%5csecret` return 403; an unknown tool id returns 404; a missing file returns 404; `toolPolicy({ network: [] })` contains `connect-src 'none'` and no `127.0.0.1`; `toolPolicy({ network: ["api.example.com"] })` contains `connect-src https://api.example.com`. Update the renderer policy test to expect `frame-src pt-tool:`.
- [ ] **Step 2: Run**; expect fail.
- [ ] **Step 3: Implement.** Resolve the path with `path.resolve` and require the result to start with the tool folder plus the separator.
- [ ] **Step 4: Run** `npm test`; expect pass.
- [ ] **Step 5: Commit** `feat(desktop): serve community tools from an isolated origin`.

---

### Task 6: Sidecar generic API

**Files:**
- Create under `api/PowerTools/PowerTools.API/Tools/CommunityToolApi/`: `CommunityToolEndpoints.cs`, `CommunityToolService.cs`, `CommunityToolClient.cs` (interface `ICommunityToolClient` plus the `ServiceClient` implementation), `CommunityToolDtos.cs`, `CommunityToolValueCodec.cs`, `CommunityToolFaults.cs`
- Modify: `api/PowerTools/PowerTools.API/Program.cs` (add `app.MapCommunityToolEndpoints();`)
- Create: `api/PowerTools/PowerTools.API.CommunityToolApi.Tests/` (copy the `.csproj` of `PowerTools.API.AttributeExplorer.Tests`; add to the solution)

Read `Tools/AttributeExplorer/` first and copy its shape: endpoints build a service over a client interface; the service returns a result with an optional problem; tests fake the client.

**Interfaces — Produces** (all under `/api/community-tools`, all with `DataverseContextFilter`, all `POST` with a JSON body except the metadata reads):

| Route | Body | Returns |
|---|---|---|
| `POST /data/retrieve` | `{ table, id, columns[] }` | `DataRecord` |
| `POST /data/fetch` | `{ fetchXml, page?, pagingCookie?, pageSize? }` | `FetchPage` |
| `POST /data/create` | `{ table, values }` | `{ id }` |
| `POST /data/update` | `{ table, id, values }` | `{}` |
| `POST /data/delete` | `{ table, id }` | `{}` |
| `POST /data/associate`, `/data/disassociate` | `{ table, id, relationship, related: EntityRef[] }` | `{}` |
| `POST /data/execute` | `{ message, parameters }` | `{ results }` |
| `POST /data/batch` | `{ operations: BatchOperation[], continueOnError }` | `{ responses: Array<{ ok, id?, error? }> }` |
| `GET /metadata/tables` | | `Array<{ logicalName, displayName, entitySetName, primaryIdAttribute, primaryNameAttribute, isCustom }>` |
| `GET /metadata/tables/{name}` | | the same object for one table |
| `GET /metadata/tables/{name}/columns` | | `Array<{ logicalName, displayName, type, isCustom, requiredLevel, targets[] }>` |
| `GET /metadata/tables/{name}/relationships` | | `Array<{ schemaName, kind: "1:N"|"N:1"|"N:N", referencedTable, referencingTable, referencingColumn }>` |
| `GET /metadata/tables/{name}/columns/{column}/choices` | | `Array<{ value, label }>` |

JSON shapes match Task 2's `DataRecord`, `FetchPage`, `EntityRef`, `BatchOperation`, and the tagged value encoding. `CommunityToolValueCodec` converts both directions; `AliasedValue` is unwrapped. Errors are `{ code, message, dataverseCode? }` with HTTP 400 for bad input, 404 for a missing record or table, 429 with `code: "Throttled"` for service-protection faults (`-2147015902`, `-2147015903`, `-2147015898`), and 502 with `code: "DataverseFault"` for other Dataverse faults. `pageSize` defaults to 500 and is capped at 5000. `batch` uses `ExecuteMultipleRequest` and accepts at most 200 operations.

- [ ] **Step 1: Write failing tests:** the codec round-trips each tagged type and plain values; `EntityReference` out of Dataverse includes `name`; a fetch with `moreRecords` returns the cookie and `page`; `pageSize: 9000` is clamped to 5000; an unknown `$type` is a 400 naming the type; a `FaultException` with code `-2147015902` maps to `Throttled`; a batch of 201 operations is a 400; batch responses line up with operations by index when one fails and `continueOnError` is true; `execute` with an empty or malformed `message` is a 400.
- [ ] **Step 2: Run** `dotnet test` in the new test project; expect fail.
- [ ] **Step 3: Implement.** Reuse metadata code from `Tools/Metadata/` and `Tools/AttributeExplorer/` where it already retrieves the same data.
- [ ] **Step 4: Run** `dotnet test` from `api/PowerTools/`; expect all projects pass.
- [ ] **Step 5: Commit** `feat(api): add generic endpoints for community tools`.

---

### Task 7: Permissions and broker

**Files:**
- Create: `desktop/src/ui/shell/community-tools/permissions.ts`, `desktop/src/ui/shell/community-tools/broker.ts`
- Modify: `desktop/tsconfig.app.json`, `desktop/tsconfig.test.json`, `desktop/vite.config.ts`, `desktop/vitest.config.ts` (alias `@powertools/sdk/protocol` to `../packages/sdk/src/protocol.ts`; add `test/renderer/**` already covers the tests)
- Test: `desktop/test/renderer/communityToolPermissions.test.ts`, `desktop/test/renderer/communityToolBroker.test.ts`

**Interfaces — Consumes:** everything in `protocol.ts` (Task 2).

**Produces:**

```ts
// permissions.ts
export const METHOD_PERMISSION: Record<MethodName, Permission | null | "per-message" | "per-operation">;
export const MESSAGE_PERMISSION: Record<string, Permission | null>;
export function authorize(manifest: { permissions: string[]; messages: string[] }, method: MethodName, args: unknown): { ok: true; needs: Permission[] } | { ok: false; message: string };

// broker.ts
export interface BrokerServices {
  getConnection(): ConnectionSnapshot | null;
  callSidecar(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown>;  // throws ToolError-shaped objects
  toast(type: "info" | "success" | "error", message: string): void;
  setStatus(text: string | null): void;
  confirm(title: string, message: string): Promise<boolean>;
  openRecord(table: string, id: string): void;
  openSolution(uniqueName: string): void;
  openFile(filters: Array<{ name: string; extensions: string[] }>): Promise<{ name: string; content: string } | null>;
  saveFile(suggestedName: string, content: string): Promise<boolean>;
  copyText(text: string): Promise<void>;
  dispatchShortcut(keys: { key: string; code?: string; ctrlKey: boolean; shiftKey: boolean }): void;
  storage: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; remove(key: string): Promise<void> };
}
export function createBroker(input: { manifest: { name: string; permissions: string[]; messages: string[] }; port: MessagePort; services: BrokerServices; maxInFlight?: number }): {
  notifyTheme(theme: ThemeSnapshot): void;
  notifyConnection(connection: ConnectionSnapshot | null): void;
  dispose(): void;
};
```

`METHOD_PERMISSION`: `data.retrieve`, `data.fetchXml` need `data:read`; `data.create`, `data.update`, `data.associate`, `data.disassociate` need `data:write`; `data.delete` needs `data:delete`; `metadata.*` need `metadata:read`; `shell.openFile`, `shell.saveFile` need `files`; `data.execute` is `per-message`; `data.batch` is `per-operation` (each operation is checked as its single-call equivalent); everything else is `null`.

`MESSAGE_PERMISSION` initial contents: `WhoAmI: null`, `RetrieveVersion: null`, `RetrieveCurrentOrganization: null`, `RetrieveEntity: "metadata:read"`, `RetrieveAllEntities: "metadata:read"`, `RetrieveAttribute: "metadata:read"`, `PublishXml: "metadata:write"`, `PublishAllXml: "metadata:write"`, `CreateEntity`, `UpdateEntity`, `CreateAttribute`, `UpdateAttribute`, `CreateOneToMany`, `CreateManyToMany`: `"metadata:write"`, `DeleteEntity`, `DeleteAttribute`: `"metadata:write"`, `SetState`, `Assign`, `GrantAccess`, `RevokeAccess`, `AddMembersTeam`, `RemoveMembersTeam`, `ExecuteWorkflow`: `"data:write"`, `BulkDelete`: `"data:delete"`.

`authorize` for `data.execute`: the message must be in `manifest.messages`, else `Message "X" is not declared in powertools-tool.json`; if it is in `MESSAGE_PERMISSION` with a permission, that permission must also be in `manifest.permissions`.

Broker behavior: at most `maxInFlight` (default 4) sidecar-bound requests run; the rest queue in arrival order. Data and metadata calls with no connection fail with `NoConnection`. After `dispose()`, no reply is posted.

- [ ] **Step 1: Write failing permission tests:** a table-driven test over every entry of `METHODS` asserting denied without and allowed with its permission; `data.execute` of `PublishXml` is denied when not in `messages`, denied when in `messages` without `metadata:write`, allowed with both; an unknown message listed in `messages` is allowed; a batch with one delete is denied without `data:delete`.
- [ ] **Step 2: Write failing broker tests** with a real `MessageChannel` and fake services: a permitted request gets `ok: true` and the sidecar fake saw the path and body from Task 6's table; a denied request gets `PermissionDenied` and the sidecar fake was not called; with six slow calls, at most four are in flight and all six complete in order; `getConnection()` returning `null` yields `NoConnection` (Review Focus 2); `notifyConnection` posts a `HostEvent`; posting `null`, `"x"`, `{ id: 1 }`, and `{ id: 2, method: "nope", args: {} }` yields `InvalidRequest` for those with an id and nothing for the rest, and a following valid request still works (Review Focus 4); `dispose()` while a call is pending posts nothing afterwards and does not throw (Review Focus 3); a services method that throws a plain `Error` yields `Internal` without the stack.
- [ ] **Step 3: Run**; expect fail.
- [ ] **Step 4: Implement** both files. Pure TypeScript; no React, no `desktopBridge`.
- [ ] **Step 5: Run** `npm test` and `npm run typecheck`; expect pass.
- [ ] **Step 6: Commit** `feat(desktop): add community tool broker and permission checks`.

---

### Task 8: Frame host and host services

**Files:**
- Create: `desktop/src/ui/shell/community-tools/CommunityToolFrame.tsx`, `desktop/src/ui/shell/community-tools/hostServices.ts`, `desktop/src/ui/shell/community-tools/themeSnapshot.ts`
- Modify: `desktop/src/ui/shell/keyboard/useShellShortcuts.ts` (export a way to run a shortcut from key state; read the file first and keep existing behavior)
- Test: `desktop/test/renderer/communityToolFrame.test.tsx`, `desktop/test/renderer/communityToolHostServices.test.ts`

**Interfaces — Consumes:** `createBroker`, `BrokerServices` (Task 7); `LoadedCommunityTool` (Task 4); `CONNECT_MESSAGE`, `ReadyMessage`, `ShortcutSpec` (Task 2); `matchShellShortcut` (existing).

**Produces:**

```ts
export function CommunityToolFrame(props: { tool: LoadedCommunityTool }): JSX.Element;   // rendered inside ToolHost, so useToolRuntime/useTabConnection work
export function createHostServices(input: {
  toolId: string; toolName: string;
  getConnection(): ConnectionInfo | null;
  openInBrowser: ReturnType<typeof useOpenInBrowser>;
  toast: ReturnType<typeof useToast>;
  setStatus(text: string | null): void;
  requestConfirm(options: { title: string; message: string; confirmLabel: string }): Promise<boolean>;
  dispatchShortcut(keys: { key: string; code?: string; ctrlKey: boolean; shiftKey: boolean }): void;
}): BrokerServices;
export function readThemeSnapshot(root?: HTMLElement): ThemeSnapshot;   // name from data-theme; tokens = every --color-* custom property
export const FORWARDED_SHORTCUTS: ShortcutSpec[];  // close-tab, next-tab, previous-tab, toggle-quick-open, toggle-sidebar. Not the primary action.
```

Frame behavior: renders `<iframe title={tool.manifest.name} sandbox="allow-scripts" src="pt-tool://<id>/<entry>">` filling the tab. On the frame's `load`, it creates a `MessageChannel` and posts `{ type: CONNECT_MESSAGE }` with one port to `iframe.contentWindow`. On `hello` with a supported `protocolVersion` (1), it replies with `ReadyMessage` and creates the broker. An unsupported version or no `hello` within 10 seconds shows the error state: `EmptyState` from `shared/ui` with the title "This tool did not start" and a "Reload" button that remounts the frame. A `MutationObserver` on `<html data-theme>` calls `notifyTheme`. A change of the tab's connection calls `notifyConnection`. Unmount calls `dispose()` and clears the status-bar text. When `hello` arrives, log `console.info` with the tool id and the milliseconds since the frame was created (the spec's time-to-handshake measurement).

Host services: `callSidecar` uses `api` from `shared/api/client.ts` with `meta.connectionId` set to the tab's connection and `noAuthRetry: true` for non-GET calls other than `/data/retrieve` and `/data/fetch`; axios errors are mapped to `ToolError` using the response body's `code`. `getConnection` maps `ConnectionInfo` to `{ displayName, kind: crmType }`. `openRecord` and `openSolution` use `useOpenInBrowser` with `buildDynamicsRecordUrl` and `solutionEditorUrl`. `toast` uses `useToast`. `setStatus` uses the same mechanism as `useToolStatus` with plain text. `confirm` uses `Modal` from `shared/ui` through `requestConfirm`. Storage and file methods call the Task 4 bridge methods.

- [ ] **Step 1: Write failing tests** (jsdom, with the fake bridge in `test/support/desktopBridge.ts`): the iframe has `sandbox="allow-scripts"` exactly and the `pt-tool://` src; after a simulated `load` and a `hello` on the port, the port receives `ReadyMessage` with `protocolVersion: 1`, the theme snapshot, and `FORWARDED_SHORTCUTS`; `hello` with `protocolVersion: 99` shows "This tool did not start"; with fake timers, 10 seconds without `hello` shows it too and "Reload" renders a fresh iframe; changing `data-theme` on `<html>` posts a `theme` event; unmount closes the port. Host services: a 429 body `{ code: "Throttled" }` becomes a `Throttled` error; the connection snapshot has exactly the keys `displayName` and `kind`; `callSidecar` never sends a path that does not start with `/api/community-tools/`.
- [ ] **Step 2: Run**; expect fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint -- --max-warnings 0`; expect pass.
- [ ] **Step 5: Commit** `feat(desktop): host community tools in a sandboxed frame`.

---

### Task 9: Registry, activity bar, and manager dialog

**Files:**
- Create: `desktop/src/ui/shell/community-tools/CommunityToolsProvider.tsx`, `desktop/src/ui/shell/community-tools/CommunityToolsDialog.tsx`, `desktop/src/ui/shell/community-tools/useToolRegistry.ts`
- Modify: `desktop/src/ui/tools/defineTool.ts` (add optional `source?: "built-in" | "local"`), `desktop/src/ui/shell/tabs/TabContext.tsx`, `desktop/src/ui/shell/tabs/TabBar.tsx`, `desktop/src/ui/shell/layout/ActivityBar.tsx`, `desktop/src/ui/shell/layout/Layout.tsx`, `desktop/src/ui/shell/layout/CommandPalette.tsx`, the File menu definition in the main process (find it from `popup-app-menu`), `CHANGELOG.md`
- Test: `desktop/test/renderer/communityToolsProvider.test.tsx`, `desktop/test/renderer/communityToolsDialog.test.tsx`; keep `desktop/test/toolRegistry.test.ts` and `desktop/test/publicCatalog.test.ts` passing unchanged

**Interfaces — Consumes:** bridge methods and `LoadedCommunityTool` (Task 4); `CommunityToolFrame` (Task 8); `TOOL_REGISTRY`, `ACTIVITY_BAR_TOOLS`, `ToolDefinition` (existing).

**Produces:**

```ts
export function useToolRegistry(): { toolsById: Record<string, ToolDefinition>; activityBarTools: ToolDefinition[] };
export function useCommunityTools(): { tools: LoadedCommunityTool[]; refresh(): Promise<void>; openManager(): void };
```

Behavior:
- A `ready` tool with consent becomes a `ToolDefinition`: `id` and `title` from the manifest, `tooltip` from `description`, `icon` from `iconDataUrl`, `showInActivityBar: true`, `source: "local"`, `component` rendering `CommunityToolFrame`. Built-in tools come first, in their existing order; community tools follow, sorted by title. A built-in id always wins.
- `TabContext`, `TabBar`, `ActivityBar`, and `Layout` read the registry through `useToolRegistry()` in place of the static imports. Community tools do not go into `publicCatalog.ts`, the welcome page, or the website.
- Activity-bar items with `source: "local"` show a `Badge` reading "Local".
- A tab whose tool is no longer in the registry (removed while open) renders `EmptyState` "This tool is no longer loaded".
- File menu and command palette get "Community tools…", which opens the dialog.
- Dialog: a list of every `LoadedCommunityTool` with name, version, publisher, folder-independent status text, and its errors for `invalid` or `missing`; a "Load from folder…" button; per row "Reload" (calls `refresh()`; the store re-reads every folder on each `list()`) and "Remove". A `ready` tool without consent shows "Review permissions": a second `Modal` listing permissions in words ("Read data", "Create and update data", "Delete data", "Read table definitions", "Change table definitions", "Open and save files"), the declared messages by name, and the network hosts, with the note "This tool was loaded from a folder on this computer and has not been reviewed." and buttons "Allow" and "Cancel". Only "Allow" calls `grantCommunityToolConsent`.
- Add under `## [Unreleased]` in `CHANGELOG.md`: "Community tools: load a tool from a local folder (File > Community tools)."

- [ ] **Step 1: Write failing tests:** with the fake bridge returning one ready, consented tool, `useToolRegistry().activityBarTools` ends with it and built-in order is unchanged; an unconsented tool is not in the registry; a tool whose id equals `attribute-explorer` does not replace the built-in; the dialog shows "Folder not found" for a `missing` tool and no "Review permissions" for it; "Allow" calls `grantCommunityToolConsent` once and the tool then appears in the registry; "Cancel" calls nothing; "Remove" calls `removeCommunityTool` and the row disappears.
- [ ] **Step 2: Run**; expect fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint -- --max-warnings 0`, `npm run build`; expect pass.
- [ ] **Step 5: Commit** `feat(desktop): list and open community tools`.

---

### Task 10: UI kit package

**Files:**
- Create: `packages/ui/package.json` (name `@powertools/ui`, version `0.1.0`; peer dependencies `react`, `react-dom` `^19`), `packages/ui/vite.config.ts`, `packages/ui/src/index.ts`, `packages/ui/src/code-editor.ts`, `packages/ui/src/styles.css`, `packages/ui/scripts/check-boundaries.mjs`
- Test: `packages/ui/tests/exports.test.ts`

**Produces:** package exports `.` (every export of `desktop/src/ui/shared/ui/index.ts` except `CodeEditor`, `CodeEditorProps`, `preloadCodeEditor`), `./code-editor` (those three), `./styles.css` (Tailwind 4 stylesheet that imports `desktop/src/ui/styles/theme.css` and scans the kit's source, so `bg-canvas` and the other token utilities are generated), and `./theme.css` (the token file alone, for tools that run their own Tailwind build).

The package re-exports from `../../desktop/src/ui/shared/ui/…`. No component source is copied. `check-boundaries.mjs` fails the build if the bundled module graph includes any file under `desktop/src/ui/platform/`, `desktop/src/ui/shell/`, `desktop/src/ui/tools/`, or `desktop/src/electron/`. If a kit component imports one of those today, move the needed piece into `desktop/src/ui/shared/` in this task without changing behavior.

- [ ] **Step 1: Write the failing test:** the set of names exported from `packages/ui/src/index.ts` plus `code-editor.ts` equals the set exported from `desktop/src/ui/shared/ui/index.ts` (so a component added to the kit later cannot be forgotten).
- [ ] **Step 2: Run**; expect fail.
- [ ] **Step 3: Implement** the package and the boundary check; wire the check into `build`.
- [ ] **Step 4: Run** `npm test` and `npm run build` in `packages/ui`; expect pass, with `dist/index.js`, `dist/code-editor.js`, `dist/styles.css`, and type declarations. Run `npm test` in `desktop/`; expect pass.
- [ ] **Step 5: Commit** `feat(ui): publish the shared UI kit as a package`.

---

### Task 11: Reference tool (Attribute Explorer)

**Files:**
- Create: `packages/reference-tool/package.json` (private; depends on `@powertools/sdk` and `@powertools/ui` through `file:` paths), `packages/reference-tool/powertools-tool.json`, `packages/reference-tool/index.html`, `packages/reference-tool/vite.config.ts`, `packages/reference-tool/src/main.tsx`, `packages/reference-tool/src/App.tsx`, `packages/reference-tool/src/icon.svg`
- Test: `packages/reference-tool/tests/app.test.tsx`

**Interfaces — Consumes:** `connect`, `PowerToolsClient` (Task 2); the UI kit (Task 10); the manifest rules (Task 3).

Manifest: `id: "powertools.attribute-explorer-reference"`, `name: "Attribute Explorer (reference)"`, `permissions: ["metadata:read"]`, `messages: []`, `network: []`, `minHostVersion` equal to the current `desktop/package.json` version.

Behavior, matching the built-in tool in `desktop/src/ui/tools/attribute-explorer/` (read it first; do not import from it): a searchable table list on the left from `metadata.tables()`; the selected table's columns on the right from `metadata.columns(name)` in a `DataTable`; clicking a column opens a `Modal` with its details; a "Refresh metadata" button; status-bar text "<n> tables" through `shell.setStatus`; an `EmptyState` when `connection.get()` is `null`, updated through `connection.onChange`. `vite build` outputs to `packages/reference-tool/dist/` with relative asset URLs and copies `powertools-tool.json` and the icon into `dist/`, so `dist/` is the folder a user loads.

- [ ] **Step 1: Write failing tests** with a fake `PowerToolsClient`: tables render and filter by search text; selecting a table calls `metadata.columns` with its logical name; a `PermissionDenied` rejection shows an `Alert` with the message; a `null` connection shows the empty state and no metadata call is made; `shell.setStatus` is called with "2 tables" for two tables.
- [ ] **Step 2: Run**; expect fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run build`; check `dist/powertools-tool.json` exists; log the compressed size of `dist/` in the task report (target: under 1.5 MB).
- [ ] **Step 5: Commit** `feat: add the reference community tool`.

---

### Task 12: End-to-end smoke, hang test, and docs

**Files:**
- Create: `desktop/test/smoke/communityTool.spec.ts`, `desktop/test/smoke/fixtures/hanging-tool/` (`powertools-tool.json`, `index.html`, `main.js` that completes the handshake by hand, without the SDK, and runs `while (true) {}` one second after `ready`)
- Modify: `desktop/package.json` (`test:smoke:run` runs both spec files), `GLOSSARY.md`, `README.md` only if it lists features
- Create: `docs/adr/0001-community-tools-are-web-only.md` (read `docs/agents/domain.md` for the ADR format first)

**Interfaces — Consumes:** `packages/reference-tool/dist/` (Task 11), the state file format `<userData>/community-tools.json` (Task 4).

The smoke tests seed the isolated user-data folder with a `community-tools.json` that lists the tool folder and a matching consent hash, so no dialog is driven.

- [ ] **Step 1: Write the smoke tests** following `desktop/test/smoke/app.spec.ts`:
  1. With the reference tool seeded, its activity-bar button is visible with a "Local" badge; clicking it opens a tab; `frameLocator("iframe")` shows the "connect to an environment" empty state (the smoke profile has no connection); the frame's `document.documentElement.dataset.theme` equals the shell's.
  2. With the hanging tool seeded and opened, wait 2 seconds so the tool is looping; within 5 seconds more the shell still opens the FetchXML Builder tab from the activity bar and the title-bar "File" button still responds.
  3. With a seeded folder path that does not exist, the app starts and File > Community tools shows "Folder not found".
- [ ] **Step 2: Run** `npm run test:smoke` from `desktop/`; fix what fails.
- [ ] **Step 3: Write the docs.** `GLOSSARY.md`: **Community tool** ("a tool built outside this repository that runs in a sandboxed frame and reaches Dataverse only through the SDK; never called a plugin"), **Tool manifest**, **Tool permission**, **Broker**, **Reference tool**. ADR: the web-only decision, the alternatives rejected (community C# in the sidecar), and the consequence (tools that need .NET-only work become host capabilities or stay built-in).
- [ ] **Step 4: Run** `npm run check` from `desktop/` and `dotnet test` from `api/PowerTools/`; expect pass.
- [ ] **Step 5: Commit** `test: cover community tools end to end; docs: glossary and ADR`.

---

## Spec coverage

| Spec section | Task |
|---|---|
| Plugin package, manifest, permissions | 3 |
| Isolation, spike | 1, 5 |
| Broker, concurrency cap, protocol version | 7, 8 |
| ToolDefinition integration, shortcuts | 8, 9 |
| SDK | 2 |
| Sidecar generic API | 6 |
| UI kit and theme | 2 (theme apply), 8 (theme push), 10 |
| Loading from a local folder, consent, reload | 4, 9 |
| Lifecycle and performance | 8 (timeout, error state), 11 (size logged), 12 (hang test) |
| Reference plugin | 11 |
| Testing | every task; 12 |
| Repo rules (changelog, glossary, ADR) | 9, 12 |

Not in this plan, by design: enforcing the size and startup budget (project 2's validator), the registry, tiers, and revocation (project 4).
