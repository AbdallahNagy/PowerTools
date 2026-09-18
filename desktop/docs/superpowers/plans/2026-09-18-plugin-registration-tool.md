# Plugin Registration Tool — Fresh Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. Do not copy XrmToolBox or Microsoft sample source.

**Goal:** Ship a new activity-bar tool `plugin-registration` that lets a Dataverse developer browse and safely manage plug-in registrations for one connection. Rebuilt from `main`; the old `cursor/stabilize-plugin-registration-47dd` branch is reference only, except the metadata-only DLL inspector and its signed test fixtures, which are ported.

**Inspiration (credit only, no code copied):** XrmToolBox Plugin Registration, https://github.com/imranakram/PluginRegistration (Microsoft / Innofactor / Biznamics / community). Domain rules come from `desktop/docs/superpowers/research/2026-09-18-plugin-registration-xrmtoolbox.md`. Power Tools is MIT; that plugin has no declared license, so only Dataverse entity names, option values, and validation rules are reused.

**Decisions**
- Scope: core loop. No workflow-activity editing, no cascade unregister of assemblies that still own steps, no packages/webhooks/solutions/export/bulk actions.
- Mutation model: one endpoint per mutation; pure validator class; single Dataverse call; structured problem response; confirmation lives in the UI; mutation requests are never auto-replayed after a 401.
- Port `PluginAssemblyInspector` (System.Reflection.Metadata `PEReader`) and its fixture projects from the old branch; write everything else fresh.

## Global Constraints

- Follow `AGENTS.md`, `desktop/AGENTS.md`, `desktop/src/ui/tools/AGENTS.md`, and `desktop/.agents/skills/ui-colors/SKILL.md` (CSS variables only, never `bg-[#hex]`).
- Tool imports only `../../shared/*` and `../../platform/*`. No new Electron IPC. File pick is HTML `<input type="file">` posted as multipart to the sidecar.
- Renderer never receives `pluginassembly.content` or `sdkmessageprocessingstepsecureconfig.secureconfig`. Never log tokens, DLL bytes, or secure config.
- One commit per task, in order.
- Tests: desktop uses Vitest + MSW + `test/support/{render.tsx,desktopBridge.ts,httpServer.ts}`; sidecar uses a new xUnit project with a `FakePluginRegistrationGateway`. No real credentials anywhere.

## Architecture

Sidecar folder: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/`
- `PluginRegistrationEndpoints.cs` — group `/api/plugin-registration` with `DataverseContextFilter`.
- `Dtos/` — records: catalog, step options, drafts, assembly, mutation result, problem, capabilities.
- `Gateway/IPluginRegistrationGateway.cs` + `Gateway/DataversePluginRegistrationGateway.cs` — the only place that touches `IOrganizationServiceAsync2`.
- `Queries/` — static `QueryExpression` builders.
- `Validation/` — pure validators and option-value constants.
- `Services/` — catalog, step options, step, image, assembly, unregister, capabilities.
- `Inspection/` — ported PE inspector.

Desktop folder: `desktop/src/ui/tools/plugin-registration/`
- `tool.ts`, `PluginRegistration.tsx`, icon, `model/`, `api/`, `components/`, `tests/node/`, `tests/renderer/`.

## HTTP surface (`/api/plugin-registration`)

Connection via headers set by `client.ts`. Errors: 400 validation, 409 dependencies/conflict, 502 Dataverse. Body always `ProblemResponse { code, message, problems: [{ field, code, message }] }`.

- `GET /capabilities` → `{ isOnline, isolationModes, sourceTypes }` (online: `[2]`/`[0]`; on-prem: `[1,2]`/`[0,1]`).
- `GET /catalog` → `{ assemblies, types, steps, images }`.
- `GET /step-options` → `{ messages, filters, users }`.
- `POST /assemblies/analyze` multipart `assembly`.
- `POST /assemblies` multipart `assembly` + `isolationMode` + `sourceType`.
- `POST /assemblies/{id}/update` multipart `assembly`.
- `POST /assemblies/{id}/unregister`, `POST /types/{id}/unregister`.
- `POST /steps`, `POST /steps/{id}/update|enable|disable|unregister`.
- `POST /images`, `POST /images/{id}/update|unregister`.

## Dataverse rules

- Isolation: 1 None, 2 Sandbox. Source: 0 Database, 1 Disk (never GAC). Culture `neutral`.
- Stage: 10 PreValidation, 20 PreOperation, 40 PostOperation (50 display-only). Mode: 0 Sync, 1 Async (Async requires stage 40). Deployment: 0 Server, 1 Offline, 2 Both (default 0). State 0/1 with status 1/2. Rank default 1. Configuration max 4096.
- Image type: 0 Pre, 1 Post, 2 Both. Attributes required, `*` rejected.
- `messagepropertyname`: Create→`Id`, Update/Delete/Assign→`Target`, Merge→`Target`, SetState/SetStateDynamicEntity→`EntityMoniker`, CreateMultiple→`Ids`, UpdateMultiple→`Targets`, DeliverIncoming/DeliverPromote/Send→`EmailId`. Other messages → `image_unsupported_message`. Create `Id` follows XrmToolBox/PRT; Microsoft Learn says `Target`.
- Component types: 90 PluginType, 91 PluginAssembly, 92 Step.
- Paging: page size 5000, cookie + page number.
- Catalog: exclude `CompiledWorkflow%` assemblies and `Compiled.Workflow%` types; steps `stage IN (10,20,40,50)`; never request `content` or secure-config columns; `hasSecureConfiguration` from lookup presence; `isSystem = customizationlevel == 0`.
- Step options: `sdkmessage.isprivate = false`; filters `iscustomprocessingstepallowed` and `isvisible`; users `isdisabled = false`.
- Step writes: create with no filter/attributes omits those attributes; update-to-empty sets null/`""`. Never send `Guid.Empty`.

---

### Task 1: Branch, plan doc, sidecar skeleton, xUnit project

- [x] Create this plan doc and commit it.
- [x] Add sidecar skeleton: DTOs, problem/exception, option values, gateway interface + Dataverse impl, endpoints with `GET /capabilities`.
- [x] Add xUnit test project + `FakePluginRegistrationGateway`.
- [x] Wire `Program.cs` and the solution.
- [x] `dotnet build PowerTools.sln` and `dotnet test PowerTools.API.PluginRegistration.Tests`.

### Task 2: Catalog queries and service

- [x] `CatalogQueries` with LIKE exclusions, stage filter, page size 5000, no `content`/`secureconfig` columns.
- [x] `CatalogService` maps four parallel `RetrieveAllAsync` calls.
- [x] `GET /catalog` endpoint.
- [x] Query and service tests.

### Task 3: Desktop tool skeleton — browse catalog

- [x] Tool manifest, icon, registry, contracts, `catalogTree`, `useCapabilities`/`useCatalog`, header/tree/details.
- [x] Registry test update.
- [x] Node + renderer tests.

### Task 4: `noAuthRetry` on the shared HTTP client

- [x] Add `meta.noAuthRetry` and skip 401 replay when set.
- [x] Renderer test: without flag two requests; with flag one request then reject.

### Task 5: Sidecar step options, validator, and step service

- [x] Step-option queries (`isprivate`, `iscustomprocessingstepallowed`, `isvisible`, `isdisabled`).
- [x] `StepDraftValidator` and `StepService` create/update/enable/disable with omit-vs-clear and secure-config keep/replace/clear.
- [x] Endpoints and tests.

### Task 6: Desktop step dialog and step actions

- [x] Hooks, `stepForm`, `apiError`, `nodeActions`, context menu, `StepDialog`, `ConfirmDialog`.
- [x] Tests for draft posting, field problems, enable action.

### Task 7: Sidecar image validator and service

- [x] Message-property map, validator, service, endpoints, tests.

### Task 8: Desktop image dialog

- [x] `useImageMutations`, `imageForm`, `ImageDialog`, tests.

### Task 9: Port the DLL inspector; sidecar assembly service

- [x] Port inspector + fixtures from `cursor/stabilize-plugin-registration-47dd`.
- [x] `AssemblyService` analyze/register/update with type sync.
- [x] Multipart endpoints and tests.

### Task 10: Desktop assembly dialog

- [x] FormData mutations, `AssemblyDialog` with analyze preview and capability-limited radios.
- [x] Tests asserting `assembly` field and `isolationMode`.

### Task 11: Unregister (sidecar + desktop)

- [x] Image delete; step transaction (images then step then secure config); type/assembly with `has_steps` + `RetrieveDependenciesForDelete`.
- [x] Desktop confirm dialog with environment, kind, name, child counts.
- [x] Tests.

### Task 12: Finish

- [x] Tool README (folder map, where validation lives, how to add an action, XrmToolBox credit).
- [x] Tick plan checkboxes.
- [x] `npm run check` and `dotnet` gates.
- [x] Draft PR with limitations: not live-verified (Create image property `Id` vs `Target`, `ExecuteTransaction`, type auto-generation).

## Known limitations

- No live Dataverse verification in this environment.
- Shared `Modal` closes on overlay click.
- Tree is not virtualized; nodes start collapsed.
- Cascade unregister of assemblies or types that still own steps is unsupported; unregister steps first.
