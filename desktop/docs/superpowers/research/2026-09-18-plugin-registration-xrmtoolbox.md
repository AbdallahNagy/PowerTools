# Plugin Registration — XrmToolBox research brief

**Date:** 2026-09-18
**Workflow:** `xrmtoolbox-plugin-researcher` (`.cursor/agents/xrmtoolbox-plugin-researcher.md`)
**Power Tools license:** MIT (`LICENSE`)
**Status:** research only. Do not start a greenfield tool on `main`. Finish the existing module.

This brief maps the open-source XrmToolBox Plugin Registration backend onto Power Tools. It does not copy WinForms UI, plugin source, or Microsoft SDK sample code.

Primary plugin source was cloned for citation to `/tmp/xrm-research/PluginRegistration` (not in this repository). GitHub currently resolves `Biznamics/PluginRegistration` to https://github.com/imranakram/PluginRegistration.

---

## Match

- **Plugin name:** Plugin Registration (NuGet title: Plugin Registration for XrmToolBox)
- **Catalog:** https://www.xrmtoolbox.com/plugins/Xrm.Sdk.PluginRegistration/
- **NuGet id:** `Xrm.Sdk.PluginRegistration`
- **Latest version:** 3.2026.4.1 (released 2026-04-02; NuGet ~22.6k downloads for that version; catalog all-version downloads ~637k)
- **Authors / owners:** Microsoft, Alexey, Jonas, Imran and the Power Platform community / Biznamics AB
- **Project URL:** https://github.com/Biznamics/PluginRegistration (GitHub `html_url` is https://github.com/imranakram/PluginRegistration)
- **Host metadata:** `IGitHubPlugin` still reports `UserName = Innofactor`, `RepositoryName = PluginRegistration` (`MainControl.cs` lines 305–307)
- **Open source flag:** catalog `Open Source: true`
- **Tags:** Development, Plugins

### License

**Unconfirmed / not OSI-declared.** GitHub `license` is `null`. There is no `LICENSE` file. The `.nuspec` has `requireLicenseAcceptance=false` and no license URL. Core files carry Microsoft Dynamics CRM SDK sample headers:

> Copyright (C) Microsoft Corporation. All rights reserved. … THIS CODE AND INFORMATION ARE PROVIDED "AS IS"

Power Tools is MIT. Treat this plugin as **inspiration-only**. Learn from Dataverse operations, entity names, validation rules, and failure modes. Do not copy source, WinForms layouts, icons, unique copy, or early-bound entity classes into this repo.

### Related plugins considered (not primary)

| Plugin | Why not primary |
| --- | --- |
| Microsoft official PRT (`Microsoft.CrmSdk.XrmTooling.PluginRegistrationTool`, `pac tool prt`) | Closed source. Spec #4 already excludes full PRT parity (packages, webhooks, profiler, virtual-table providers). Use only as a message-property / docs reference. |
| Register Plugin Assembly and Plugin Steps (`RegisterMSCrmPlugInSteps`) | XML import helper; last notable activity 2018. |
| Assembly Recovery Tool (`MsCrmTools.AssemblyRecoveryTool`) | Export stored DLLs; not registration. |
| Delta Plugins (`Carfup.XTBPlugins.DeltaAssemblyvsCrm`) | Local vs CRM assembly compare. |
| Plugin Trace Viewer (`Cinteros.XrmToolBox.PluginTraceViewer`) | Plugin traces, not registration. |

### Confidence

**High.** Catalog NuGet id, project URL, cloned source, and Dataverse helpers all match. Official Microsoft PRT is a related reference only for a few image property names the XrmToolBox port already encodes.

---

## What it does

Browse and mutate Dataverse plug-in registrations for **one** connected organization:

- Load the hierarchy: plugin packages (org ≥ 9.2), assemblies, plugin types / workflow activities, steps, images; optionally service endpoints and webhook endpoints (`serviceendpoint.contract = 8`).
- Inspect a local DLL and register or update a `pluginassembly` (Database / Disk / GAC / Package source; Sandbox / None isolation).
- Register, update, enable, disable, and unregister `sdkmessageprocessingstep` records (unsecure/secure configuration, impersonation, filtering attributes, stage, mode, rank, deployment).
- Register, update, and unregister `sdkmessageprocessingstepimage` records (pre / post / both).
- Update custom workflow activity metadata (`plugintype` name, friendly name, group name, description).
- Register NuGet **plugin packages** (`pluginpackage` create/update + `AddSolutionComponent`).
- Add assembly (component type 91), step (92), or package to an unmanaged solution.
- Bulk enable/disable every step under a package, assembly, plugin, message, or entity grouping.
- Show a local “dependencies” list; for workflow activities, scan `workflow.xaml` for the type name.
- Export selected registrations to Excel/CSV (webhooks included in later versions).
- Filter managed assemblies and excluded name prefixes; refresh the `sdkmessage` list including custom actions.

**Power Tools in-scope loop:** assembly / type / step / image / workflow-activity, with safer inspection and mutations than the WinForms tool.

**Out of established product scope (spec #4):** packages, webhooks, profiler, Excel export, add-to-solution, bulk enable-all, dual-environment flows.

---

## Backend findings

### Dataverse operations

Catalog load (`OrganizationHelper`) is sequential `RetrieveMultiple` over:

| Entity | Query highlights |
| --- | --- |
| `systemuser` | LINQ `CreateQuery`; `fullname`, `domainname`, `internalemailaddress`, `isdisabled`. **Unbounded, no page size.** |
| `sdkmessage` | `isprivate = false`, order by `name` |
| `sdkmessagefilter` | `sdkmessageid In (…)`, **`iscustomprocessingstepallowed = true`**, **`isvisible = true`** |
| `pluginpackage` | skipped if org version &lt; 9.2 |
| `pluginassembly` | exclude `name Like CompiledWorkflow%`; optional exclude managed / name prefixes; keep `customizationlevel` null or ≠ 0 **or** name in `Microsoft.Crm.ObjectModel`, `Microsoft.Crm.ServiceBus`; drop `packageid` column before 9.2 |
| `plugintype` | exclude `typename Like Compiled.Workflow%`; same system-type allowlist; inner join to filtered assemblies |
| `serviceendpoint` | `contract ≠ 8` (Azure) vs `contract = 8` (webhook), org ≥ 9.0 |
| `sdkmessageprocessingstep` | **`stage In (10, 20, 40, 50)`**; left outer join to `sdkmessageprocessingstepsecureconfig` |
| `sdkmessageprocessingstepimage` | inner join to steps that pass the stage filter |

Mutations (`RegistrationHelper`) are ordinary CRUD. There is **no** `ExecuteTransactionRequest` and **no** `ExecuteMultipleRequest` in this plugin.

- **Assembly:** `Create` / `Update` `pluginassembly`. Database source sets `content` to Base64 of the DLL. Isolation `None=1`, `Sandbox=2`. Source `Database=0`, `Disk=1`, `GAC=2`, `Package=4`.
- **Type:** `Create` / `Update` `plugintype` (workflow-activity metadata; Dataverse also generates types when assembly content is written).
- **Step:** `Create` / `Update` `sdkmessageprocessingstep`. Secure config is a related `sdkmessageprocessingstepsecureconfig` via relationship `sdkmessageprocessingstepsecureconfigid_sdkmessageprocessingstep`.
- **Enable/disable:** `SetStateRequest` on `sdkmessageprocessingstep` with `State` Enabled(0)/Disabled(1) and `Status = -1`.
- **Image:** `Create` / `Update` / `Delete` `sdkmessageprocessingstepimage`.
- **Unregister:** sequential `Delete` images → steps → secure configs → types → assemblies → service endpoints. Children are discovered with extra `RetrieveMultiple`. Partial failure leaves a damaged tree.
- **Solution:** `AddSolutionComponentRequest` (`AddRequiredComponents = false`; component types 91 assembly / 92 step / package type from `solutioncomponentdefinition`).
- **Identity:** `WhoAmIRequest` to pick the calling user from the loaded user list.
- **Attributes:** `RetrieveEntityRequest` with `EntityFilters.Attributes`, **`RetrieveAsIfPublished = false`**, then keep attributes where `IsValidForRead` and `AttributeOf is null`.
- **Package:** `Create`/`Update` `pluginpackage` with `content`, `name`, `version`, `uniquename`, `solutionid`.

There is **no** `RetrieveDependenciesForDelete`. “Show dependencies” lists in-memory children, or does a **non-paged** `RetrieveMultiple` on `workflow` (`type=1`, `statecode in (0,1)`) and `xaml.Contains(plugin.TypeName)`.

### Metadata and registration rules

- Message/filter identity is **`sdkmessagefilterid`**, not primary table alone. Primary/secondary tables come from `primaryobjecttypecode` / `secondaryobjecttypecode`. Literal `"none"` is a real Dataverse value.
- Image `messagepropertyname` is hardcoded per message in `UpdateMessageProperties`:

  | Message | Property |
  | --- | --- |
  | Create | **`Id`** (not `Target`) |
  | Update | `Target` |
  | Delete | `Target` |
  | Assign | `Target` |
  | Merge | `Target` and `SubordinateId` |
  | SetState / SetStateDynamicEntity | `EntityMoniker` |
  | CreateMultiple | `Ids` |
  | UpdateMultiple | `Targets` |
  | DeliverIncoming / DeliverPromote | `EmailId` |
  | Send | `EmailId` (email only) |

  Microsoft Learn currently lists Create as `Target`. Live-prove which Create property Dataverse accepts before locking the validator.

- Filtering attributes: Update always; Create / CreateMultiple / UpdateMultiple only when org ≥ 9.1 / 9.2 (`SupportsFilteredAttributes`). Empty filtering attributes on **create** must **omit** the attribute; on **update**, send `""` to clear.
- `sdkmessagefilterid`: on create with primary entity `none`, **omit** the lookup. On update to none, set the lookup to null. Do not send `Guid.Empty`.
- Stages: 10 PreValidation, 20 PreOperation, 40 PostOperation, 50 PostOperationDeprecated. Async (`mode=1`) only with post stages.
- Deployment `supporteddeployment`: 0 server, 1 offline, 2 both. Driven by filter `availability`.
- Images: Pre=0, Post=1, Both=2. Create cannot take a pre-image. Null/empty image `attributes` historically meant “all columns”; Power Tools correctly rejects `*`.
- Assembly update: XrmToolBox **blocks major/minor version changes** and **blocks the update if any previously registered type is missing** from the new DLL. Assemblies that contain plugins must be strongly named (`publickeytoken` required). Isolation Sandbox is refused if a selected type is not isolatable (legacy v4 `Microsoft.Crm.Sdk.IPlugin`).
- Local inspection uses `Assembly.LoadFrom` inside a secondary AppDomain. That **executes** assembly code. Do not copy that.

### Paging, batching, retries, limits

- `RetrieveMultipleAllPages` walks `PagingCookie` and increments `PageNumber` after the first page. The first call has no `PageInfo`; later pages set cookie + page number via reflection. This is cookie-based paging, not a page-1 reset. **Do not copy the reflection helper.** Use an explicit `PageSize` (the in-progress sidecar uses 5000).
- `LoadUsers` is unbounded LINQ-to-CRM.
- Unregister and bulk enable/disable are sequential SDK calls with no batch, retry, or transaction.
- Step configuration length is capped in the 2026 UI (#156). Power Tools already uses 4096 on the PR branch.
- Catalog load is one large in-memory graph. Assembly-to-file mappings and excluded-assembly prefixes are XrmToolBox settings XML.

### Privileges and connections

- Single organization connection (`IOrganizationService`). No dual-environment flow.
- Typical privileges: `prvRead/Create/Write/Delete` on `pluginassembly`, `plugintype`, `sdkmessageprocessingstep`, `sdkmessageprocessingstepimage`, `sdkmessageprocessingstepsecureconfig`; `prvRead` on `sdkmessage`, `sdkmessagefilter`, `systemuser`; impersonation requires `prvSetImpersonatingUserIdOnSdkMessageProcessingStep`.
- Secure-config left join: `FaultException` error **`0x80040220` (PrivilegeDenied)** → drop the join, set `SecureConfigurationPermissionDenied`, retry, and never send secure config on later writes.
- System / `customizationlevel = 0` nodes cannot be updated or unregistered (`IsNodeSystemItem`).
- Online isolation is Sandbox + Database only. On-prem Disk/GAC/None remain possible.

### Validation and failure modes

- Async + non-post stage refused.
- At least one deployment (server or offline) required.
- All-attributes warning for non-Create messages (#165). Create filtering attributes unavailable on some 9.1 on-prem orgs (#164).
- Primary entity `none` must not write a bogus filter id (#163).
- Create steps cannot register pre-images (#66).
- Missing plugin types in an updated DLL abort the whole update.
- Major/minor assembly version bump refused; register a new assembly instead.
- Secure configuration overwrite is an explicit confirm in the WinForms UI; stored secret is displayed when the user has read privilege. **Power Tools must not display or round-trip the stored secret.**
- Unregister of a system item is blocked with “required for the Microsoft Dynamics CRM system”.
- Plugin-package load has had GCC High failures (#158).

### Source citations

All paths are under the cloned Biznamics/imranakram PluginRegistration tree.

```205:262:Xrm.Sdk.PluginRegistration/Helpers/OrganizationHelper.cs
// LoadAssemblies: QueryExpression pluginassembly + CreateAssemblyFilter + RetrieveMultipleAllPages
```

```907:949:Xrm.Sdk.PluginRegistration/Helpers/OrganizationHelper.cs
// Exclude CompiledWorkflow%; optional managed/name filters; keep customizationlevel≠0 or ObjectModel/ServiceBus
// Steps limited to stage 10/20/40/50
```

```1174:1179:Xrm.Sdk.PluginRegistration/Helpers/OrganizationHelper.cs
query.Criteria.AddCondition("iscustomprocessingstepallowed", ConditionOperator.Equal, true);
query.Criteria.AddCondition("isvisible", ConditionOperator.Equal, true);
```

```1262:1280:Xrm.Sdk.PluginRegistration/Helpers/OrganizationHelper.cs
// PrivilegeDenied 0x80040220 on secure-config join → retry without the link
```

```1425:1517:Xrm.Sdk.PluginRegistration/Helpers/OrganizationHelper.cs
// Image property names: Create=Id, Update=Target, Delete=Target, Merge Target/SubordinateId, SetState=EntityMoniker
```

```154:175:Xrm.Sdk.PluginRegistration/Helpers/RegistrationHelper.cs
// RegisterAssembly: Create pluginassembly; Database source sets Content = Convert.ToBase64String(dll)
```

```256:289:Xrm.Sdk.PluginRegistration/Helpers/RegistrationHelper.cs
// RegisterStep: Create sdkmessageprocessingstep; related secure config in RelatedEntities
```

```489:547:Xrm.Sdk.PluginRegistration/Helpers/RegistrationHelper.cs
// Unregister: sequential Delete image → step → secureconfig → plugintype → pluginassembly
```

```1253:1277:Xrm.Sdk.PluginRegistration/Helpers/RegistrationHelper.cs
// Enable/disable: SetStateRequest, Status = -1
```

```742:782:Xrm.Sdk.PluginRegistration/Wrappers/CrmPluginStep.cs
// none-filter: omit on create, null on update; empty filtering attributes: omit on create, "" on update
```

```31:70:Xrm.Sdk.PluginRegistration/OrganizationServiceExtensions.cs
// Cookie paging after the first page (do not copy the reflection PageInfo helper)
```

```69:157:Xrm.Sdk.PluginRegistration/AssemblyReader.cs
// Assembly.LoadFrom + GetExportedTypes: IPlugin / legacy IPlugin / CodeActivity (do not copy; executes IL)
```

```351:370:Xrm.Sdk.PluginRegistration/Forms/ImageRegistrationForm.cs
// Create disables PreImage
```

```161:180:Xrm.Sdk.PluginRegistration/Forms/DependenciesDialog.cs
// Non-paged workflow RetrieveMultiple + xaml.Contains(TypeName)
```

```349:368:Xrm.Sdk.PluginRegistration/Forms/PluginRegistrationForm.cs
// Block major/minor version changes on assembly update
```

```2296:2302:Xrm.Sdk.PluginRegistration/MainControl.cs
Service.Execute(new AddSolutionComponentRequest { AddRequiredComponents = false, ComponentId, ComponentType, SolutionUniqueName });
```

```291:310:Xrm.Sdk.PluginRegistration/Helpers/OrganizationHelper.cs
RetrieveEntityRequest { EntityFilters.Attributes, RetrieveAsIfPublished = false }
// keep IsValidForRead && AttributeOf is null
```

### Keep vs leave behind

**Keep (domain rules, not code):**

- Filter choice by `sdkmessagefilterid`; label with message + primary + secondary.
- `iscustomprocessingstepallowed` + `isvisible` + `isprivate = false`.
- Stage/mode rules; Create has no pre-image; Update should not filter on the primary key.
- Omit `sdkmessagefilterid` and `filteringattributes` on create when unused; explicit null/empty on update.
- Secure-config privilege degradation (`0x80040220`).
- Strong-name requirement; Sandbox vs non-isolatable types; on-prem Disk/None only when the environment allows it.
- Child-before-parent delete order (images → steps → types → assembly), **only inside one proven transaction**.
- `WhoAmI` / enabled users for impersonation; keep an unavailable current user rather than silently dropping it.
- Message-property map for images; live-prove Create `Id` vs `Target`.
- Metadata-only assembly inspection (Power Tools already does this better than `Assembly.LoadFrom`).
- `RetrieveDependenciesForDelete` (Power Tools already does this; better than XAML scan).

**Leave behind:**

- WinForms tree, property grid, Excel/CSV export, XrmToolBox settings XML, icons, donate/branding.
- `Assembly.LoadFrom` / AppDomain inspection.
- Sequential non-transactional cascade and bulk enable-all across a hierarchy.
- Displaying or round-tripping stored secure configuration.
- Plugin packages, webhooks/service endpoints, Azure ACS, profiler, add-to-solution, GAC, stage 50, invocation source, XAML-contains workflow search.
- Showing Microsoft system assemblies as editable.
- Full Microsoft PRT parity.

---

## Power Tools mapping

This is a **new activity-bar tool**, not an extension of FetchXML Builder or Data Migration.

Plugin Registration is **not on `main`**. The established product direction already exists:

- Issue #4: Spec: Stabilize and complete Plugin Registration
- Issues #5–#17: follow-on work
- Draft PR #18, branch `cursor/stabilize-plugin-registration-47dd`
- Design: `desktop/docs/superpowers/specs/2026-08-29-plugin-registration-tool-design.md` (on that branch)

Do not invent a second tool. Map XrmToolBox backend rules onto that module.

### Established ids (PR #18, not on `main`)

| Field | Value |
| --- | --- |
| Tool id | `plugin-registration` |
| Title | Plugin Registration |
| Tooltip | Browse and safely manage Dataverse plug-in registrations |
| Activity bar | `showInActivityBar: true`, `allowMultipleInstances: true` |
| Desktop folder | `desktop/src/ui/tools/plugin-registration/` |
| Sidecar folder | `api/PowerTools/PowerTools.API/Tools/PluginRegistration/` |
| Connection | single connection, `meta.connectionName` only |

Folder layout already on the PR branch:

```text
desktop/src/ui/tools/plugin-registration/
├── tool.ts
├── PluginRegistration.tsx
├── api/             useRegistrationCatalog, useStepMutations, useAssemblyMutations,
│                    useImageMutations, useWorkflowActivityMutations, useUnregisterMutations,
│                    usePluginRegistrationCapabilities, useWorkflowActivityDetails
├── model/           contracts, mutationContracts, registrationActions, catalogTree
├── components/      tree, details, context menu, dialogs
└── tests/           node + renderer
```

### Reuse from current `main`

- HTTP: `desktop/src/ui/shared/api/client.ts` (`apiGet` / `apiPost` + `meta.connectionName`).
- **401 replay:** `main` retries every 401. Mutation execute/preflight **must not** auto-replay `Create`/`Update`/`Delete` after a recovered token. PR #18 adds `noAuthRetry: true` to the axios config. Keep that flag when merging.
- Connections: `useConnections` / `useConnectionSelection`. Changing connection must invalidate catalog, dialogs, and plan tokens (spec stories 2–3).
- Status: `useToolStatus`.
- Shared UI: `Button`, `Modal`, `SearchInput`, `Spinner`, `Toast`, `DataTable`, `ProgressBar`, `Checkbox`. Do not import FetchXML Builder or Data Migration internals.
- Metadata: `GET /api/metadata/entities` is useful for display names. Prefer the dedicated step-filter metadata endpoint for filtering/image columns (includes filter identity). Do **not** send FetchXML (`POST /api/fetch/execute`) for this catalog.
- File pick: HTML `<input type="file">` in the renderer, multipart to the sidecar. **No new Electron IPC.** `desktopBridge` has no open-file API; do not add one.
- DLL inspection stays in the sidecar (`PluginAssemblyInspector` / `System.Reflection.Metadata.PEReader`). Renderer never sees a Dataverse SDK and never executes the DLL.

### Sidecar surface to keep (`/api/plugin-registration`)

All maps use `DataverseContextFilter` + `DataverseClientFactory`. Register with `app.MapPluginRegistrationEndpoints()` in `Program.cs` (absent on current `main`).

| Method | Path | Dataverse behind it |
| --- | --- | --- |
| GET | `/catalog` | Paged `RetrieveMultiple` `pluginassembly`, `plugintype`, `sdkmessageprocessingstep` (+ message/filter links), `sdkmessageprocessingstepimage`. Page size 5000. **Must not return `content` or `secureconfig`.** |
| GET | `/capabilities` | cascade + on-prem flags. `SupportsCascadeTransactionAsync` is currently hard-false until live proof |
| GET | `/step-options` | `sdkmessage` (`isprivate=false`); `sdkmessagefilter`; `systemuser` (`isdisabled=false`, `accessmode ≠ 3`) |
| GET | `/step-filters/{filterId}/metadata` | `Retrieve` filter + `RetrieveEntityRequest` (`Entity`+`Attributes`) |
| GET | `/steps/{stepId}/edit-details` | `Retrieve` step, parent type, filter, secure-config **id/version only** |
| GET | `/workflow-activities/{id}/details` | catalog row + `RetrieveDependenciesForDelete` / workflow argument metadata |
| POST | `/assemblies/analyze` | metadata-only PE inspect; no Dataverse write |
| POST | `/assemblies/register/preflight` and `/execute` | multipart `assembly` + `draft` + `planToken`; `Create` `pluginassembly` with Base64 `content` |
| POST | `/assemblies/{id}/update/preflight` and `/execute` | `UpdateRequest` + `ConcurrencyBehavior.IfRowVersionMatches` |
| POST | `/steps/create/{preflight,execute}` and `/steps/{id}/{update\|enable\|disable\|unregister}/{preflight,execute}` | `StepDraftDto` + signed plan; `ExecuteTransactionRequest` of CUD + related secure-config CUD |
| POST | `/images/create/...` and `/images/{id}/{update\|unregister}/...` | `ExecuteTransactionRequest`; parent step `Update` with row version + image CUD |
| POST | `/workflow-activities/{id}/update/{preflight,execute}` | `Update` `plugintype` with row version |
| POST | `/cascade-unregister/{preflight,execute}` | `RetrieveDependenciesForDelete` then transactional ordered `DeleteRequest`s — **release-disabled** |

### Already covered by spec #4 / PR #18

- Activity-bar tool `plugin-registration` and folder layout.
- Complete catalog in parallel pages; tree virtualization; connection-scoped react-query.
- Metadata-only assembly inspection, size cap, strong-name, target-framework diagnostics as **backend blockers**.
- Signed short-lived preflight plans, one-shot mutation, readback, structured problems.
- Filter identity, targeted step edit-details, keep/set/clear for impersonation and configs.
- Image: explicit columns required; Create cannot be pre-image; duplicate alias; managed/read-only reasons.
- Workflow activity distinct from ordinary plugin; contract protection on assembly update.
- Cascade gated until disposable live proof; **no sequential fallback** (explicitly better than XrmToolBox).
- `RetrieveDependenciesForDelete` (better than the plugin’s XAML scan).

### Gaps to close against XrmToolBox backend rules

These are in-scope for the existing spec tickets (#7, #8, #11), not new product surface.

1. **Step-options filters** currently load every `sdkmessagefilter`. Add `iscustomprocessingstepallowed = true` and `isvisible = true`. Keep an already-configured invisible filter as an unavailable current value.
2. **Create + primary entity none:** omit `sdkmessagefilterid` (do not send `Guid.Empty`). Update-to-none should null the lookup. PR `MutateStepAsync` currently always writes `new EntityReference("sdkmessagefilter", draft.SdkMessageFilterId)`.
3. **Create + no filtering attributes:** omit the attribute; update-to-empty send `""`. PR currently always writes `string.Join(',', draft.FilteringAttributes)`.
4. **Secure config:** `StepEditDetailsDto.SecureConfiguration` still round-trips the secret. Return **existence + version only**. Catch `0x80040220` on secure-config `Retrieve` and degrade like XrmToolBox.
5. **Attribute metadata:** apply `IsValidForRead` and exclude `AttributeOf`. Prefer `RetrieveAsIfPublished = false` unless unpublished columns are an explicit product choice. Image preflight currently takes every attribute logical name, including child attributes. XrmToolBox uses `RetrieveAsIfPublished = false`.
6. **Image `messagepropertyname`:** do not default `Target` for every message. Use the XrmToolBox/Microsoft map; live-prove Create (`Id` vs `Target`) and Merge (`Target`/`SubordinateId`). Restrict supported image messages rather than silently using the wrong property. PR currently uses `property ?? "Target"`.
7. **Deployment / async auto-delete:** spec user story 22 names deployment settings. `StepDraftDto` has no `supporteddeployment` or `asyncautodelete`. Add them if that story stays in scope; default online to Server-only.
8. **Catalog noise:** XrmToolBox hides most `customizationlevel = 0` assemblies. Spec wants a complete catalog; keep system rows **read-only** instead of excluding them.
9. **Shared 401 retry:** keep `noAuthRetry` (or equivalent) on mutation execute/preflight. Current `main` retries every 401.

Out of scope (do not add endpoints): plugin packages, webhooks, `AddSolutionComponent`, Excel export, profiler, bulk enable-all, dual-environment headers (`meta.targetConnectionName`).

---

## Recommended implementation

Credit Plugin Registration (Microsoft / Innofactor / Biznamics / community) as inspiration only. Reimplement from SDK knowledge. Do not paste Microsoft-copyrighted sample code into this MIT repo.

### 1. Contracts and API (sidecar first)

Keep `/api/plugin-registration/*` on `cursor/stabilize-plugin-registration-47dd`.

- Tighten `RetrieveStepOptionsAsync` filter criteria (`iscustomprocessingstepallowed`, `isvisible`).
- Change step create/update entity building to omit vs null `sdkmessagefilterid` and `filteringattributes` per XrmToolBox.
- Strip `SecureConfiguration` from edit-details JSON; keep `secureConfigExists` + secure-config version.
- Map image property names by message; live-prove Create.
- Optionally add `supporteddeployment` / `asyncautodelete` to `StepDraftDto` if story 22 remains.
- Do not copy XrmToolBox helpers, early-bound entities, or `Assembly.LoadFrom`.

### 2. Tool module

Keep `desktop/src/ui/tools/plugin-registration/`. Renderer talks only through `apiGet`/`apiPost` + `meta.connectionName`. DLL bytes go multipart, request-local, never persisted. Status via `useToolStatus`.

### 3. Registry

On merge to `main`:

- Import `pluginRegistrationTool` once in `desktop/src/ui/tools/registry.tsx`.
- Call `app.MapPluginRegistrationEndpoints()` in `api/PowerTools/PowerTools.API/Program.cs`.

### 4. Tests

Extend credential-free gateway tests for:

- Filter query conditions (`iscustomprocessingstepallowed`, `isvisible`).
- Create-omit vs update-clear of filter/attributes.
- Secure-config privilege denied (`0x80040220`).
- Image property by message.
- No secret in catalog/edit-details JSON.

Keep renderer tests for dialog routing (#5), step loading (#6), identity-based filters (#7). Guarded live tests (#8, #10, #11, #15) against a disposable org: register a signed fixture, update step/image, verify readback, prove cascade transaction or keep cascade **release-disabled**. Never log tokens, DLL bytes, or secure config.

### Risks

- Copying sequential unregister would violate spec #4 and can orphan steps. Keep transactional-or-gated.
- Executing customer DLLs in the sidecar is a security incident; PE metadata inspection is mandatory.
- Returning `secureconfig` in edit-details is both a spec defect and a privilege leak.
- Create image property (`Id` vs `Target`) and none-entity filter omission are easy to get wrong without a disposable org.
- Catalog without `iscustomprocessingstepallowed` will offer filters Dataverse will reject at `Create`.

### What not to copy

- Any file under `Xrm.Sdk.PluginRegistration` (WinForms, wrappers, `RegistrationHelper`, icons, `Plugin.cs` images).
- XrmToolBox host APIs, settings XML, Excel export, webhook/package UI.
- Microsoft PRT binaries or scraping xrmtoolbox.com at runtime.
- New Electron IPC for file pick or secrets.

---

## Research method

1. Catalog search: https://www.xrmtoolbox.com/plugins/Xrm.Sdk.PluginRegistration/
2. NuGet: https://www.nuget.org/packages/Xrm.Sdk.PluginRegistration/
3. Clone: `git clone https://github.com/Biznamics/PluginRegistration` → `/tmp/xrm-research/PluginRegistration` (resolves to `imranakram/PluginRegistration`)
4. Backend files: `Helpers/OrganizationHelper.cs`, `Helpers/RegistrationHelper.cs`, `Wrappers/CrmPluginStep.cs`, `OrganizationServiceExtensions.cs`, `AssemblyReader.cs`, `Forms/ImageRegistrationForm.cs`, `Forms/DependenciesDialog.cs`, `Forms/PluginRegistrationForm.cs`, `MainControl.cs`
5. Power Tools mapping: current `main` tool registry + sidecar maps; `git fetch` of `cursor/stabilize-plugin-registration-47dd` for existing Plugin Registration contracts (not merged)
