# MCP server, phases 3–6: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add approval, record writes, schema, solutions, plugins, environment variables, group toggles and the direct-HTTP option to the phase 1–2 MCP server, finishing the v1 catalog in the spec.

**Architecture:** Builds on `desktop/src/electron/mcp/` from phases 1–2.

- Power Tools classifies every call. Non-read calls resolve their connection **in the server** before running, pass a main-side approval gate (a per-connection switch, plus a renderer dialog over IPC), and only then run.
- New Dataverse operations live in a new sidecar area, `api/PowerTools/PowerTools.API/Tools/Agent/`, under `/api/agent/*`. It reuses existing C# services and adds new ones for schema and solutions.

**Tech stack:** As in phases 1–2. C# uses `Microsoft.Xrm.Sdk` messages (`CreateEntityRequest`, `CreateAttributeRequest`, `CreateOneToManyRequest`, `CreateManyToManyRequest`, `CreateOptionSetRequest`, `InsertOptionValueRequest`, `UpdateAttributeRequest`, `PublishXmlRequest`, `PublishAllXmlRequest`, `DeleteAttributeRequest`, `DeleteEntityRequest`, `DeleteRelationshipRequest`, `CloneAsPatchRequest`, `CloneAsSolutionRequest`, `AddSolutionComponentRequest`, `RemoveSolutionComponentRequest`).

**Spec:** `desktop/docs/superpowers/specs/2026-11-12-mcp-server-design.md` (authoritative for behaviour and the catalog table). ADR: `docs/adr/0002-mcp-server-transport-and-approval.md`. Phase 1–2 plan: `desktop/docs/superpowers/plans/2026-11-12-mcp-server-phases-1-2.md` (its Global Constraints still apply).

## Global constraints (in addition to phases 1–2)

**Effect classes**

- Read runs.
- Change runs without a dialog only when the target connection has `agentChangesWithoutAsking === true`; otherwise it asks.
- Destructive **always** asks. No setting, argument or annotation skips it.
- The class is decided in main by the tool's `effect`, which may be a function of the arguments (and of current metadata, see T4.3). It is never decided by client annotations.

**The approval dialog**

- One dialog at a time, with a FIFO queue.
- A 5-minute timeout gives `ApprovalTimedOut`. A window closed or destroyed gives `ApprovalUnavailable`. Deny gives `ApprovalDenied`, with the hint `Do not retry; ask the user what to do instead.`
- When the main window isn't focused, show an Electron `Notification` ("Power Tools: an agent is waiting for your approval") and call `mainWindow.flashFrame(true)`. Clicking the notification focuses the window.
- Dialog copy:
  - Title: `An agent wants to <summary>`
  - Rows: `Connection: <display name>` and `Tool: <tool title>`
  - For destructive calls, a warning block using danger theme tokens: `This removes <removes> from <connection>. It cannot be undone.`
  - Arguments sit in a collapsed `<pre>` as pretty JSON, rendered as text.
  - Buttons: `Deny` (default focus) and `Allow`.

**Errors**

New codes:

| Code | Hint |
|---|---|
| `ApprovalDenied` | `Do not retry; ask the user what to do instead.` |
| `ApprovalTimedOut` | `Ask the user to look at Power Tools.` |
| `ApprovalUnavailable` | `Ask the user to look at Power Tools.` |
| `PublisherRequired` | lists `Publishers: <unique name> (<prefix>), …`, then `Ask the user which publisher to use.` |

**Activity log**

- `approval` is one of `"not-needed" | "auto" | "allowed" | "denied" | "timed-out" | "unavailable"`.

**Sidecar agent routes**

- `/api/agent/*` uses the same `{ code, message, dataverseCode? }` error body and `DataverseContextFilter` as `/api/community-tools`.
- Codes used: `InvalidRequest`, `PublisherRequired`, `NotFound`, `DataverseFault`, `Throttled`, `Internal`. Main maps `NotFound` to `InvalidRequest` and passes `PublisherRequired` through.

**Solutions and publishers**

- Every tool that creates or edits a solution-aware component accepts optional `solution` (a unique name). Create tools also accept optional `publisher` (a unique name or customization prefix).
- Publisher rule: the publisher comes from `solution`'s publisher, or from `publisher`. With neither, the call fails with `PublisherRequired`. A schema name not starting with `<prefix>_` fails with `InvalidRequest`. Both checks happen before any write.
- Create messages that support it get `SolutionUniqueName`; otherwise call `AddSolutionComponentRequest { AddRequiredComponents = false }` right after. Edit tools add the component to `solution` if it isn't already there.
- Plugin assembly paths: main accepts only an absolute path to an existing file ending in `.dll` (case-insensitive), at most 16 MB, and sends the bytes base64-encoded.

**Commits and gates**

- One commit per task: `feat(mcp): …` or `fix(mcp): …`, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Before each phase is done, run the full desktop gate (typecheck, lint with `--max-warnings 0`, `npm test`, `build:renderer`) plus `dotnet build` and the touched .NET test projects.
- Add a `CHANGELOG.md` line under `[Unreleased]` per phase.

## Review focus

1. **Two destructive calls arrive at once** (an agent fires them in parallel). Expect two dialogs in sequence, never two at once, and never one approval applied to both. Tested in T3.1.
2. **The connection switch is on, the call is destructive.** Expect it to still ask. Tested in T3.1 and T3.4.
3. **`schema_update_column` lowering maxLength from 200 to 100.** Expect it destructive, so it asks even with the switch on. Raising it to 300 is a change. Tested in T4.3.
4. **A create call with no `solution` and no `publisher`.** Expect `PublisherRequired` listing the publishers, and no metadata written. Tested in T4.2.
5. **`execute_message` with an unknown custom API, or with `ExecuteMultiple`.** Expect the unknown one to ask as destructive and the forbidden one to fail with `InvalidRequest` without asking. Tested in T3.4.
6. **Adding a column to a form whose XML has several tabs and sections.** Expect the existing layout unchanged byte-for-byte apart from the inserted row. Tested in T4.4.

---

## Phase 3: approval and record writes

### T3.1: Approval gate in main

**Files:**
- Create: `desktop/src/electron/mcp/approval.ts`
- Test: `desktop/test/electron/mcp/approval.test.ts`

**Interfaces:**
- `export interface ApprovalRequest { id: string; tool: string; title: string; connection: string; effect: "change" | "destructive"; summary: string; removes?: string; args: Record<string, unknown> }`
- `export type ApprovalOutcome = "auto" | "allowed" | "denied" | "timed-out" | "unavailable"`
- `export function createApprovalGate(deps: { present(req: ApprovalRequest): void; dismiss(id: string): void; attention(): void; timeoutMs?: number; now?: () => number }): { decide(req: Omit<ApprovalRequest, "id">, connectionAllowsChanges: boolean): Promise<ApprovalOutcome>; respond(id: string, allow: boolean): void; failAll(outcome: "unavailable"): void }`

Rules:

- A change with `connectionAllowsChanges` is `auto` and is not presented.
- Everything else is queued and presented one at a time, calling `attention()` when presented.
- `respond` with an unknown or stale id is ignored.
- A timeout (default 300000 ms) gives `timed-out` and dismisses the dialog.

- [ ] Write tests:
  - auto path
  - destructive with the switch on still presents
  - two queued requests present in order, and responding to the first presents the second
  - a stale id is ignored
  - timeout, using fake timers
  - `failAll` resolves all pending as `unavailable`
- [ ] Implement, run the tests, commit.

### T3.2: Per-connection switch

**Files:**
- Modify: `desktop/src/electron/connectionStore.ts` and `connectionTypes.ts`. Add `agentChangesWithoutAsking?: boolean`, persisted, default false, included in `ConnectionSummary`, accepted by `update-connection`.
- Modify: the edit form in `desktop/src/ui/shell/connection-windows/` (where organization and environment are edited). Add a shared `Checkbox` labelled `Let agents make non-destructive changes without asking`, with helper text `Deletions and other destructive changes always ask.`
- Modify: `desktop/src/ui/platform/desktopBridge.ts` types.
- Test: extend `test/electron/connectionStore.test.ts` (round-trip, default false, migration of old files) and the connection window renderer test.

- [ ] Write tests, implement, run, commit.

### T3.3: Approval dialog and IPC

**Files:**
- Modify: `desktop/src/electron/mcp/mcpIpc.ts`
  - main sends `mcp-approval-present` (an `ApprovalRequest`) and `mcp-approval-dismiss` (`id`) to the main window
  - the renderer invokes `mcp-approval-respond` (`id: string, allow: boolean`) with a validated sender
- Modify: `preloadApi.cts`, adding `onMcpApprovalPresent(cb)`, `onMcpApprovalDismiss(cb)` and `respondMcpApproval(id, allow)`. Also modify `desktopBridge.ts`.
- Create: `desktop/src/ui/shell/agents/ApprovalDialog.tsx` and `useApprovalRequests.ts`, mounted once in `Layout.tsx`.
- Test: `test/electron/mcpIpc.test.ts` (approval channels), `test/renderer/approvalDialog.test.tsx`.

The copy is fixed in Global Constraints. `Deny` has initial focus. Escape means Deny. The args `<pre>` never uses `dangerouslySetInnerHTML`.

- [ ] Write tests:
  - the destructive warning text appears exactly as specified
  - change requests show no warning
  - Escape sends deny
  - a dismiss removes the dialog
  - args containing `<img src=x onerror=alert(1)>` render as literal text
- [ ] Implement, run, commit.

### T3.4: Server gating, record write tools, `execute_message`

**Files:**
- Modify: `desktop/src/electron/mcp/types.ts`:
  - `AgentTool.effect` becomes `EffectClass | ((args, ctx) => EffectClass | Promise<EffectClass>)`
  - add `describe(args): { summary: string; removes?: string }`, required when the effect can be other than read
  - `group` gains `"schema" | "solutions" | "plugins" | "envvars"`
  - `ResolvedConnection` gains `allowsChanges: boolean`
- Modify: `connections.ts` (fill `allowsChanges` from the summary) and `mcpServer.ts`. For a tool whose effect isn't the constant `"read"`, the server:
  1. resolves the connection from `args.connection`
  2. computes the effect
  3. if not read, calls `gate.decide` and maps a non-allow outcome to `AgentToolError`
  4. runs the tool with a context whose `resolveConnection` returns that same resolved connection (it never re-resolves to a different one)
  5. logs `approval`
- Modify: `errors.ts` codes; `mcpService.ts` wires the gate to IPC and the main window.
- Create: `desktop/src/electron/mcp/tools/recordWrites.ts`

| Tool | Effect | Args | Sidecar |
|---|---|---|---|
| `records_create` | change | `table`, `values` object | `POST /api/community-tools/data/create` |
| `records_update` | change | `table`, `id`, `values` | `.../data/update` |
| `records_delete` | destructive (removes "record <table> <id>") | `table`, `id` | `.../data/delete` |
| `records_associate` | change | `table`, `id`, `relationship`, `related` [{logicalName,id}] 1–100 | `.../data/associate` |
| `records_disassociate` | destructive | same | `.../data/disassociate` |
| `execute_message` | `messageEffect(message)`; `forbidden` → `InvalidRequest` before asking | `message`, `parameters` object | `.../data/execute` |

Notes:

- The `values` and `parameters` descriptions explain the typed value encoding from `packages/sdk/src/protocol.ts` `TypedValue` (`{"$type":"EntityReference","logicalName":"account","id":"…"}`, `{"$type":"OptionSetValue","value":1}`, `Money`, `DateTime`, and so on). Plain strings, numbers, booleans and null are plain.
- Results from these tools use `dataverseResult`.

- [ ] Write tests (server integration with a fake gate and fake sidecar):
  - a change with the switch off asks, and the run happens only after allow
  - denied gives `ApprovalDenied` with no sidecar call
  - `records_delete` with the switch on still asks
  - `execute_message` `WhoAmI` runs with no ask
  - `execute_message` `ExecuteMultiple` gives `InvalidRequest` with no ask
  - `execute_message` `new_DoThing` asks as destructive
  - the activity log records `approval`
  - the connection resolved for approval is the one used for the call
- [ ] Implement, run the gate, add the CHANGELOG line, commit.

---

## Phase 4: schema

### T4.1: Agent sidecar area and publisher rules

**Files:**
- Create: `api/PowerTools/PowerTools.API/Tools/Agent/AgentEndpoints.cs` (`MapAgentEndpoints`, a group `/api/agent` with `DataverseContextFilter`, using the same JSON body reading and error helper style as `CommunityToolEndpoints.cs`), plus `AgentFaults.cs`, `AgentClient.cs` (`IAgentClient`: `ExecuteAsync`, `RetrieveMultipleAsync`, with a test seam like `ICommunityToolClientSource`), and `AgentPublishers.cs`
- Modify: `Program.cs` (map the endpoints)
- Create test project: `api/PowerTools/PowerTools.API.Agent.Tests/`, shaped like `PowerTools.API.CommunityToolApi.Tests`, added to the sln

**Interfaces:**
- `AgentPublishers.ResolveAsync(IAgentClient, string? solution, string? publisher, CancellationToken) -> AgentResult<PublisherInfo>`
  - `PublisherInfo(Guid Id, string UniqueName, string Prefix, int OptionValuePrefix)`
  - `solution` looks up `solution.publisherid`; an unknown solution is `NotFound`
  - `publisher` matches `uniquename` or `customizationprefix`, case-insensitive
  - neither gives `PublisherRequired`, with the message listing every publisher except Microsoft's internal ones (`MicrosoftCorporation`)
- `AgentPublishers.CheckSchemaName(string schemaName, PublisherInfo) -> AgentProblem?`
- `GET /api/agent/metadata/publishers` returns `[{ uniqueName, friendlyName, prefix }]`

- [ ] Write tests with a fake client: every rule above, including "a solution's publisher wins when both are given and they match" and "solution and publisher disagree → InvalidRequest".
- [ ] Implement, run, commit.

### T4.2: Create tables, columns, lookups, N:N and choices

**Files:**
- Create: `Tools/Agent/AgentSchemaService.cs` and `AgentSchemaDtos.cs`. Routes:
  - `POST /api/agent/schema/tables`
  - `POST /api/agent/schema/columns`
  - `POST /api/agent/schema/lookups`
  - `POST /api/agent/schema/many-to-many`
  - `POST /api/agent/schema/choices`
  - `POST /api/agent/schema/choices/options`
  - `GET /api/agent/metadata/choices/{name}` (global choice options)
- Main: create `desktop/src/electron/mcp/tools/schema.ts` with `schema_create_table`, `schema_create_column`, `schema_create_lookup`, `schema_create_many_to_many`, `schema_create_choice`, `schema_add_choice_option` (all change). Extend `metadata_get_choices` to accept `choice` (a global name) instead of `table` and `column`.

Request shapes (camelCase JSON):

- `tables`: `{ schemaName, displayName, pluralName, description?, ownership: "user"|"organization", primaryNameSchemaName?, primaryNameDisplayName?, primaryNameMaxLength?, solution?, publisher? }`
  - The primary name defaults to `<prefix>_name` / `Name` / 100.
  - Returns `{ logicalName, metadataId }`.
- `columns`: `{ table, schemaName, displayName, description?, type: "text"|"memo"|"integer"|"decimal"|"money"|"boolean"|"datetime"|"dateonly"|"choice"|"multichoice"|"file"|"image", requiredLevel?: "none"|"recommended"|"required", maxLength?, minValue?, maxValue?, precision?, format?: "email"|"url"|"phone"|"text", globalChoice?, options?: [{ label, value? }], trueLabel?, falseLabel?, solution?, publisher? }`
  - Exactly one of `globalChoice` or `options` is allowed for choice types.
  - Option values default to `OptionValuePrefix * 10000 + n`.
  - Language is the org base language.
- `lookups`: `{ table, schemaName, displayName, targets: string[] (1–10), requiredLevel?, relationshipSchemaName?, solution?, publisher? }`
  - One target uses `CreateOneToManyRequest` (relationship name default `<prefix>_<target>_<table>_<lookupname>`, truncated by `PolymorphicLookupRules.TruncateRelationshipSchemaName`).
  - More than one target reuses `PolymorphicLookupService.CreateAsync`.
- `many-to-many`: `{ table1, table2, schemaName, solution?, publisher? }`
- `choices`: `{ schemaName, displayName, options: [{label, value?}] (1–400), solution?, publisher? }`
- `choices/options`: `{ choice? , table?, column?, label, value?, solution? }`, taking either `choice` or `table`+`column`

- [ ] Write the C# tests: request construction for each type, `SolutionUniqueName` set, a publisher-prefix mismatch is rejected before `ExecuteAsync`, and option value numbering.
- [ ] Write the TS tests: schemas reject a bad `type`, the description has the class phrase, and `describe` summaries (for example `create column new_rating on account`).
- [ ] Implement, run, commit.

### T4.3: Update column (argument-dependent effect) and publish

**Files:**
- C#: `POST /api/agent/schema/columns/update` `{ table, column, displayName?, description?, requiredLevel?, maxLength?, solution? }` (retrieve the attribute, set the given fields, `UpdateAttributeRequest { MergeLabels = true }`). `POST /api/agent/schema/publish` `{ tables?: string[] }` (`PublishXmlRequest` with an `<importexportxml><entities>…` body, or `PublishAllXmlRequest` when empty).
- TS:
  - `schema_update_column`: `effect: async (args, ctx)`. When `maxLength` is given, read the current column through `GET /api/community-tools/metadata/tables/{t}/columns`; if it isn't present or `ColumnInfo` lacks maxLength, use the new `GET /api/agent/metadata/tables/{t}/columns/{c}`, which returns `{ type, maxLength? }`. A lower `maxLength` is `destructive` with removes `values longer than <n> characters in <table>.<column>`; otherwise `change`.
  - `schema_publish` is a change.
- [ ] Write tests: 200 to 100 is destructive, 200 to 300 is change, no `maxLength` is change, publish with no tables means publish all.
- [ ] Implement, run, commit.

### T4.4: Forms and views

**Files:**
- C#: `Tools/Agent/AgentFormXml.cs` and `AgentViewXml.cs`, as pure static XML editors with their own tests.
  - `GET /api/agent/metadata/forms?table=` returns `[{ id, name, type, tabs: [{ name, label, sections: [{ name, label }] }] }]`, for main forms (type 2) and quick create forms (7).
  - `POST /api/agent/schema/forms/add-column` `{ table, formId, column, tab?, section?, solution? }`: inserts `<row><cell id="{guid}"><labels><label description="<display>" languagecode="<base>"/></labels><control id="<column>" classid="<by type>" datafieldname="<column>"/></cell></row>` at the end of `<rows>` of the named section, or of the first section of the first tab. If the column is already on the form, it's `InvalidRequest`. It updates `systemform.formxml` and then adds the form to `solution` when given.
  - `GET /api/agent/metadata/views?table=` reuses `EntityViews.RetrieveAsync` (system views only).
  - `POST /api/agent/schema/views/add-column` `{ table, viewId, column, width? (default 150), solution? }`: appends `<cell name="<column>" width="<w>"/>` to the first `<row>` of `layoutxml`, and `<attribute name="<column>"/>` to the root `<entity>` of `fetchxml`. If the column is already in the layout, it's `InvalidRequest`.
- Control `classid` by attribute type:
  - text `{4273EDBD-AC1D-40d3-9FB2-095C621B552D}`
  - memo `{E0DECE4B-6FC8-4a8f-A065-082708572369}`
  - integer `{C6D124CA-7EDA-4a60-AEA9-7FB8D318B68F}`
  - decimal `{C3EFE0C3-0EC6-42be-8349-CBD9079DFD8E}`
  - money `{533B9E00-756B-4312-95A0-DC888637AC78}`
  - boolean `{67FAC785-CD58-4f9f-ABB3-4B7DDC6ED5ED}`
  - datetime `{5B773807-9FB2-42db-97C3-7A91EFF8ADFF}`
  - choice `{3EF39988-22BB-4f0b-BBBE-64B5A3748AEE}`
  - lookup `{270BD3DB-D9AF-4782-9025-509E298DEC0A}`
  - anything else uses text
- TS: `metadata_list_forms` and `metadata_list_views` (read); `schema_add_column_to_form` and `schema_add_column_to_view` (change).
- [ ] Write tests:
  - FormXml fixture with two tabs, three sections: inserting into a named section leaves every other node unchanged (compare serialized documents outside the inserted row)
  - unknown section is `InvalidRequest`
  - duplicate column is `InvalidRequest`
  - the view edit appends both cells and attribute
  - duplicate in the view is `InvalidRequest`
- [ ] Implement, run, commit.

### T4.5: Schema deletes

- C#:
  - `POST /api/agent/schema/columns/delete` `{ table, column }`
  - `POST /api/agent/schema/tables/delete` `{ table }` (custom only, else `InvalidRequest`)
  - `POST /api/agent/schema/relationships/delete` `{ schemaName }`
- TS: `schema_delete_column`, `schema_delete_table`, `schema_delete_relationship`, all **destructive**, with removes text such as `column new_rating from account and all its data`.
- [ ] Write tests (C# request building and the custom-only rule; TS class and removes text), implement, run the phase gate, add the CHANGELOG line, commit.

---

## Phase 5: solutions, plugins, environment variables

### T5.1: Solutions

C# `Tools/Agent/AgentSolutionsService.cs`:

| Route | Body or query | Dataverse |
|---|---|---|
| `GET /api/agent/solutions?unmanagedOnly=` | | reuse `SolutionComponentsMoverService.GetSolutionsAsync`; add `isPatch` (has `parentsolutionid`) and `version` |
| `GET /api/agent/solutions/{uniqueName}/components?componentType=` | | `solutioncomponent` query; map type names with `ComponentLayerNames` where available |
| `POST /api/agent/solutions` | `{ uniqueName, displayName, publisher, version? ("1.0.0.0") , description? }` | create `solution` |
| `POST /api/agent/solutions/patch` | `{ solution, displayName?, version? }` (default: parent version with build+1) | `CloneAsPatchRequest` |
| `POST /api/agent/solutions/clone` | `{ solution, displayName?, version }` | `CloneAsSolutionRequest` |
| `POST /api/agent/solutions/components/add` | `{ solution, componentType: number \| "table" \| "column" \| "form" \| "view" \| "pluginassembly" \| "pluginstep" \| "envvar", componentId?, table?, column?, addRequiredComponents? (false) }` | `AddSolutionComponentRequest`; resolves `componentId` from `table`/`column` names when given |
| `POST /api/agent/solutions/components/remove` | `{ solution, componentType, componentId \| table/column }` | `RemoveSolutionComponentRequest` |
| `GET /api/agent/solutions/layers?componentType=&componentId=` | | reuse `SolutionLayersService` |
| `POST /api/agent/solutions/layers/remove-active` | | reuse `SolutionLayersService` remove-active |

TS `tools/solutions.ts`:

- read: `solutions_list`, `solutions_list_components`, `solutions_list_publishers` (uses `/api/agent/metadata/publishers`), `solutions_list_layers`
- change: `solutions_create`, `solutions_create_patch`, `solutions_add_component`
- destructive:
  - `solutions_remove_component`
  - `solutions_clone`: removes `the patches of <solution>; they are rolled up into the new version`
  - `solutions_remove_active_layer`

- [ ] Write C# tests for request building (patch version default, name to id resolution, unknown solution is `NotFound`) and TS tests for classes, schemas and describe. Implement, run, commit.

### T5.2: Plugins

C# `/api/agent/plugins/*` calls the existing `PluginRegistration/Services` classes directly:

- `GET /api/agent/plugins/catalog` uses the catalog service.
- `GET /api/agent/plugins/step-options` uses the step options service.
- `POST /api/agent/plugins/assemblies` `{ fileName, contentBase64, solution? }`: analyze, then register.
- `POST /api/agent/plugins/assemblies/{id}/update` `{ fileName, contentBase64 }`
- `POST /api/agent/plugins/steps`, `/steps/{id}/update`, `/steps/{id}/state` `{ enabled }`
- `POST /api/agent/plugins/images`, `/images/{id}/update`
- `POST /api/agent/plugins/unregister` `{ kind: "assembly"|"type"|"step"|"image", id }`

Bodies use the existing `StepDraftDto` and `ImageDraftDto` shapes. If the existing services take `IFormFile`, add an overload taking `(string fileName, byte[] content)` and make the endpoint path call it, so there's one implementation.

TS `tools/plugins.ts`:

- read: `plugins_list` (filters: `assembly?`, `table?`, `message?`), `plugins_get_step_options`
- change: `plugins_register_assembly` (arg `path`; main validates and reads the file per the global constraints), `plugins_register_step`, `plugins_update_step`, `plugins_set_step_state`, `plugins_register_image`, `plugins_update_image`
- **destructive**: `plugins_update_assembly` (removes `the current code of assembly <name>`), `plugins_unregister`
- When `solution` is given, created components are added to it.

- [ ] Write tests:
  - TS: the path rules (relative path, missing file, `.exe`, a file over 16 MB are each `InvalidRequest`, without reading the file), classes, schemas mirroring `StepDraftDto`
  - C#: the byte overload equals the form-file path
- [ ] Implement, run, commit.

### T5.3: Environment variables

C# `/api/agent/envvars*` reuses `EnvironmentVariablesService` and its rules:

- `GET /api/agent/envvars`
- `POST /api/agent/envvars/definitions` `{ schemaName, displayName, type, defaultValue?, description?, solution?, publisher? }`
- `POST /api/agent/envvars/values` `{ definition (schemaName), value }` creates or updates the current value
- `POST /api/agent/envvars/delete` `{ kind: "definition"|"value", schemaName }`

TS: `envvars_list` (read), `envvars_create_definition` (change), `envvars_set_value` (change), `envvars_delete` (destructive).

- [ ] Write tests, implement, run the phase gate, add the CHANGELOG line, commit.

---

## Phase 6: polish

### T6.1: Group toggles

- Settings `mcp.groups: Record<group, boolean>`; a missing entry means on.
- The registry's `list()` and `get()` filter by enabled groups. Toggling calls `notifyToolsChanged()`.
- `AgentsDialog` shows a checkbox per group with its tool count.
- IPC `mcp-set-group` `(group, enabled)` with validation.
- [ ] Write tests: a disabled group's tools are absent from `tools/list` and `tools/call` gives "Unknown tool"; toggling sends `notifications/tools/list_changed` to an open session (integration). Implement, commit.

### T6.2: Direct HTTP option

- Settings: `mcp.http.enabled` (default false) and `mcp.http.port` (default 47800, valid range 1024–65535).
- The HTTP token is 32 random bytes in hex, stored with `safeStorage.encryptString` in `userData/mcp-http-token.bin`, and created on first enable.
- When the HTTP option is enabled, the host listens on the fixed port instead of 0, and `tokens()` returns `[connectorToken, httpToken]`. The discovery file holds the connector token only.
- A port in use sets `error: "Port <n> is in use"` and leaves the server off.
- AgentsDialog gets a "Direct HTTP" section:
  - a checkbox, and a port input
  - "Copy client config", which copies `{"type":"http","url":"http://127.0.0.1:<port>/mcp","headers":{"Authorization":"Bearer <token>"}}` to the clipboard through the platform adapter; the token is never shown as text
  - "Regenerate token", which writes a new token, restarts the host and warns that clients need the new config
- IPC: `mcp-set-http` `({enabled, port})`, `mcp-copy-http-config`, `mcp-regenerate-http-token`. The token goes to the clipboard **from main**; it is never returned to the renderer.
- [ ] Write tests:
  - both tokens are accepted
  - the HTTP token persists across service restarts (fake `safeStorage`)
  - regenerate invalidates the old token
  - the copy IPC returns `undefined` and calls clipboard with the JSON
  - the renderer never receives a 64-hex string
- [ ] Implement, commit.

### T6.3: Progress and cancellation

- For `schema_publish`, `solutions_create_patch`, `solutions_clone`, `plugins_register_assembly` and `plugins_update_assembly`: when the request has `_meta.progressToken`, send `notifications/progress` at start (`progress: 0`) and before returning (`progress: 1, total: 1`).
- Abort signals already flow to `fetch`. Verify that `notifications/cancelled` aborts the sidecar request.
- [ ] Write integration tests for both, implement, commit.

### T6.4: Docs

- `desktop/docs/tool-building-pipeline.md`: add an "Agent tools" section saying the tool brief lists which `<group>_*` agent tools the tool adds, with effect class and `/api/agent` route, or "none". Add the same heading to the brief template it describes.
- Add `desktop/docs/mcp-server.md`, a short user guide:
  - turning it on
  - connecting Claude Code, Claude Desktop and VS Code
  - the per-connection switch
  - what always asks
  - the activity log
  - the HTTP option
- Final CHANGELOG wording for the whole feature.
- [ ] Write, run the full gate, commit.
