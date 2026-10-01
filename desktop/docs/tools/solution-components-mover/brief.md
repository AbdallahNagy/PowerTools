### Match

- Plugin name: Solution Components Mover. Catalog URL: https://www.xrmtoolbox.com/plugins/MsCrmTools.SolutionComponentsMover/. NuGet id: `MsCrmTools.SolutionComponentsMover`. Author: MscrmTools.
- Catalog description: "Transfer solution components across solutions". Latest catalog and NuGet version: `1.2026.1.29` (released 2026-01-29). NuGet reports 12,038 downloads of that version. Open source: true. Catalog tag: Solutions. NuGet tags: `XrmToolBox Plugin SolutionComponentMover`. The package targets .NET Framework 4.8 and depends on XrmToolBox `>= 1.2016.4.28`. The project file references `XrmToolBoxPackage` 1.2025.10.74 and `MscrmTools.Xrm.Connection` 1.2025.9.64.
- `1.2026.1.29` release notes: stop an environment variable definition from pulling its environment variable value into the target solution. Catalog and NuGet project URL: https://github.com/MscrmTools/XrmToolBox/wiki/Manage-NN-relationships. That page is not this plugin. The control's help URL is https://github.com/MscrmTools/MsCrmTools.SolutionComponentsMover/wiki.
- Source repository: https://github.com/MscrmTools/MsCrmTools.SolutionComponentsMover. Commit `a0ec24086f283e77a3d0dead3bf78dcd92feb48c` (2026-01-29, "Updated version + Nuget packages") sets `AssemblyVersion` and `AssemblyFileVersion` to `1.2026.1.29`. The published `lib/net48/Plugins/MsCrmTools.SolutionComponentsMover.dll` has file version `1.2026.1.29` and contains the same messages and request names as that tree (`AddSolutionComponentRequest`, `IncludedComponentSettingsValues`, `RetrieveMetadataChangesRequest`, `solutioncomponentdefinition`, the best-practice failure text, and the classic solution editor URL). There are no plugin tests.
- License: **GNU General Public License v3.0 (GPL-3.0)**. GitHub reports SPDX `GPL-3.0`. The repository `LICENSE` file is the GPL-3 text. The NuGet nuspec has no license expression. This is copyleft. Power Tools must not copy this plugin's source, WinForms UI, icons, or unique copy into the MIT-licensed repo. Treat the plugin as inspiration only. Reimplement the described Dataverse behavior from this brief. Do not start that implementation until the license impact is accepted.
- Related catalog plugins, not used as the source: Solution Components Deduplicator (MscrmTools, https://www.xrmtoolbox.com/plugins/MsCrmTools.SolutionComponentsDeduplicator/) finds components that sit in more than one solution and removes them. Solution Table Integrity Manager (MscrmTools, https://www.xrmtoolbox.com/plugins/MscrmTools.SolutionTableIntegrityManager/) checks how tables were added to unmanaged solutions. Neither copies components from one solution to another. Their source was not read.
- Confidence: high. The published assembly version, the GitHub commit that set that version, and the strings and SDK request names in the NuGet binary agree.

### What it does

- Loads visible solutions in one environment, except the solution whose unique name is `Default`.
- Shows friendly name, unique name, publisher name, installed date, version, and whether the solution is managed.
- Filters that list by a case-insensitive substring of any of those values. Sorts by a column when the user asks. Installed date sorts as a date when both values parse; every other column sorts as text.
- Source selection can include managed and unmanaged solutions. Target selection is unmanaged only. Both lists allow more than one solution.
- Copies components from the selected source solutions into each selected target solution. It does not remove them from the sources.
- Before the copy, asks which component types to include. Every type starts selected. The user can select all, clear all, or invert. Choosing every type copies every component. Choosing a subset copies only those type codes.
- With the best-practice check on (the default), refuses the whole copy when an unmanaged source contains a table component that includes all of its assets and that table is managed. With the check off, those components are copied with the rest.
- Reports each add as success or failure and continues after a failure. One component failure does not roll back earlier adds. The log can be cleared or exported.
- Opens a solution in the browser at `{environment url}/tools/solution/edit.aspx?id={solution id}`.
- Uses one environment. It does not compare or copy across two environments, and it does not publish the target.

### Backend findings

Published behavior is `MsCrmTools.SolutionComponentsMover` `1.2026.1.29` at commit `a0ec24086f283e77a3d0dead3bf78dcd92feb48c`. One `IOrganizationService`. No `WhoAmI`, `CallerId`, impersonation, `ExecuteMultipleRequest`, `ExecuteTransactionRequest`, `RemoveSolutionComponentRequest`, `Update`, `Delete`, or publish.

**Solutions.** `RetrieveSolutions` (`SolutionManager.cs` 24-45) calls `RetrieveMultiple` with a `QueryExpression` on `solution`. Columns: `publisherid`, `installedon`, `version`, `uniquename`, `friendlyname`, `description`, `ismanaged`. Conditions: `isvisible` equal true, and `uniquename` not equal `Default`. No order, no `PageInfo`, no paging cookie. `description` is never shown. The Active solution is not excluded.

`SolutionPicker.LoadSolutions` (`SolutionPicker.cs` 37-63) drops managed rows when `CanDisplayManagedSolutions` is false. The source picker sets that flag true and the target picker sets it false (`MainControl.Designer.cs` 204 and 230). Displayed values are `friendlyname`, `uniquename`, `publisherid` `EntityReference.Name`, `installedon` formatted with the machine short-date pattern, `version`, and `ismanaged`. A null `publisherid` throws before the list is shown. A null publisher name does not. The client filter (`SolutionPicker.cs` 65-76) keeps a row when the friendly name or any other displayed cell contains the filter text after `ToLower()`.

**Component types.** `LoadSolutions` (`MainControl.cs` 47-69) also runs, on the same service:

- `RetrieveOptionSetRequest` with `Name` = `componenttype`. The option collection is `OptionSetMetadata.Options`.
- `MetadataHelper.LoadEntities` (`MetadataHelper.cs` 15-28): `RetrieveMetadataChangesRequest` whose `EntityQueryExpression` asks only for `LogicalName`, `DisplayName`, and `SchemaName`, with `ClientVersionStamp` null. No metadata filter, so this is every table.
- When `OrganizationMajorVersion` is at least 9 and `OrganizationMinorVersion` is at least 1: `RetrieveMultiple` on `solutioncomponentdefinition` with `NoLock` true, columns `objecttypecode` and `primaryentityname`, and `canbeaddedtosolutioncomponents` equal true. No paging.

The type dialog (`ComponentTypeSelector.cs` 74-96) uses the definition list only on that 9.1 path (`MainControl.cs` 132-139). For each definition it takes the entity whose `LogicalName` equals `primaryentityname` (`First`, so a missing table throws and the dialog does not open) and shows `DisplayName.UserLocalizedLabel.Label`, or `SchemaName` when that label is missing. The item value is `objecttypecode`. If code 80 is still absent, it adds code 80. Then it adds every `componenttype` option whose value is not already present, using `Label.UserLocalizedLabel.Label`, or the first `LocalizedLabels` entry when the user label is missing. A null `Label` throws on that fallback. The list is sorted by label. Every item starts checked.

`btnOK` (`ComponentTypeSelector.cs` 51-58) stores the checked integer codes and sets all-types when the checked count equals the item count. Cancel copies nothing. The older checkbox panel, including the note that business rules follow workflows, is hidden (`ComponentTypeSelector.Designer.cs` 488, `Visible = false`). The copy path has no business-rule exception.

**Reading components.** `RetrieveComponentsFromSolutions` (`SolutionManager.cs` 155-207) queries `solutioncomponent` with `ColumnSet(true)`. Condition: `solutionid` `In` the selected source ids. Inner link to `solution` on `solutionid`, alias `solution`, column `ismanaged`. When all types were selected, there is no `componenttype` condition. Otherwise it adds `componenttype` `In` the checked codes. An empty source list or an empty type list still builds that `In` condition.

The 2022 paging loop is still the published loop. It calls `RetrieveMultiple`, appends `Entities`, and while `MoreRecords` is true increments `PageInfo.PageNumber` and assigns `PagingCookie`. It never sets `PageInfo.Count`. `PageNumber` therefore starts at the `PagingInfo` default of 0 and the first follow-up page is 1. Solutions and `solutioncomponentdefinition` still use one unpaged `RetrieveMultiple`.

**Best-practice check.** Before any add, `CopyComponents` (`SolutionManager.cs` 53-75) always builds this subset, even when the check is off: `componenttype` value equals 1, `rootcomponentbehavior` value equals 0, and aliased `solution.ismanaged` is false. A null `componenttype`, a null `rootcomponentbehavior` on a type-1 row, or a missing aliased `ismanaged` throws and aborts the copy. The check itself runs only when that subset is non-empty and the checkbox is on (`MainControl.Designer.cs` 299, default checked).

`GetManagedEntities` (`SolutionManager.cs` 209-241) sends `RetrieveMetadataChangesRequest` with `ClientVersionStamp` null and a metadata filter of `MetadataId` `In` those `objectid` values plus `IsManaged` equal true. Properties: `DisplayName`, `LogicalName`, `SchemaName`. If any managed table comes back, it throws and nothing is added. The names in that failure are not the managed tables. They are the first 10 rows of the full entity metadata collection (`emds`), ordered by display label or schema name. The `Select` expression is `"- " + label ?? schemaName`. String concatenation binds first, so a missing label becomes a dash and a space, and the schema name is never used. The extra-items suffix uses `managedEmds.Count > 10`, not the length of the full metadata list. Managed source rows are excluded by the `ismanaged` condition, so the same table included from a managed solution does not trip the check.

**Add.** For each target, then each source row, it calls `service.Execute` with a new `AddSolutionComponentRequest` (`SolutionManager.cs` 77-151):

- `AddRequiredComponents` = false.
- `ComponentId` = `objectid`.
- `ComponentType` = `componenttype` value.
- `SolutionUniqueName` = the target `uniquename`.
- When `OrganizationMajorVersion` is at least 8, `DoNotIncludeSubcomponents` is true when `rootcomponentbehavior` is 1 or 2. It is left false when the value is 0 or missing. The plugin does not read an option set for those integers.
- When `ComponentType` is 380 (`ComponentTypes.EnvironmentVariableDefinition`), it then forces `DoNotIncludeSubcomponents` true and `IncludedComponentSettingsValues` to an empty string array, including on versions below 8. Constant 381 (`EnvironmentVariableValue`) is never referenced. The source comment says a null settings array includes settings and an empty array excludes them, so a definition does not pull its value unless that value is itself a source row and is added later. That null-versus-empty contract was not checked against a live organization. The published binary does reference `IncludedComponentSettingsValues`.

There is no distinct on `(objectid, componenttype)`. The same component in two source solutions is executed twice. Each target gets the full list, including duplicates. A per-add exception is caught, recorded, and the loop continues. There is no retry and no throttle delay. Success and failure lines are one entry per component per target.

The progress label is chosen before the `try` (`SolutionManager.cs` 86-107). `ConnectionDetail.UseOnline` is a different flag from the 9.1 version check. Online: find a `solutioncomponentdefinition` whose `objecttypecode` equals `componenttype`, then the entity with that `primaryentityname`, and use its display label or schema name. If that entity is missing, use the `componenttype` user-localized label. A null definition list throws here and aborts the remaining adds. On-premises: use only the option-set label, even when the 9.1 definition list was loaded for the dialog. If both are missing, the label includes the numeric type code.

Opening a solution (`MainControl.cs` 111-114) starts the browser at `{WebApplicationUrl}/tools/solution/edit.aspx?id={solution.Id}`. Organization version and the online flag come from the XrmToolBox connection detail, not from `RetrieveVersionRequest`.

**Privileges.** Nothing is probed. Listing needs read access to `solution`. The component query also needs read access to `solutioncomponent`, and the inner link fails the whole read when `solution` cannot be read. The 9.1 path needs read access to `solutioncomponentdefinition`. Type labels need the global option set `componenttype` and entity metadata. The check needs `RetrieveMetadataChanges`. Each add needs permission to customize that unmanaged solution and the component being added. A fault on one add is that line's message. A fault on the initial load, the component query, the best-practice query, or the unguarded nulls above fails the whole operation. Managed targets are hidden, not rejected in `CopyComponents`. The server still rejects an add into a managed solution if one is submitted.

**Failure modes to keep visible.** Unpaged solution and definition queries stop at the server page and look complete. The component loop can repeat or skip rows because `Count` is unset and `PageNumber` starts at 0. An empty source selection or a cleared type list reaches `ConditionOperator.In` with an empty array. The best-practice `Where` can throw while the checkbox is off. The failure names the wrong tables. A component that already belongs to the target, or that is added twice because two sources contain it, is a logged error after any earlier success. Environment variable values are copied only as their own source rows after the 380 override. `AddRequiredComponents` false means dependencies are not pulled in. Source solutions are unchanged.

**Keep.** Same-environment copy into one or more unmanaged solutions. Visible solutions except unique name `Default`. Managed sources allowed, managed targets excluded. Type list from `solutioncomponentdefinition` on version 9.1 and above, plus code 80 when missing, plus the `componenttype` option set. All types selected means no `componenttype` filter. `AddSolutionComponentRequest` with `AddRequiredComponents` false. `DoNotIncludeSubcomponents` true for `rootcomponentbehavior` 1 and 2 on version 8 and above. The 380 override: `DoNotIncludeSubcomponents` true and an empty `IncludedComponentSettingsValues`. Best-practice refusal, before any add, for type 1, behavior 0, unmanaged source, managed table metadata. Per-component faults do not stop the rest. One connection.

**Leave behind.** WinForms layout, colors, icons, and the plugin's log and dialog sentences. The hidden type checkboxes and the hidden business-rule note. The best-practice list that reads the full metadata collection, the string-concatenation fallback, and the null dereference that runs when the check is off. Duplicate `Execute` calls for the same object and type. Paging with `Count` left at 0. Unpaged solution and definition reads. `ColumnSet(true)` on `solutioncomponent`. Synchronous UI work, TLS and XrmToolBox settings, and the base64 images in `Plugin.cs`.

### Power Tools mapping

This is a new activity-bar tool. It is not an extension of FetchXML Builder, FetchXML Tester, Data Migration, Plugin Registration, Polymorphic Lookup Creator, or Workflow Activities Viewer. Polymorphic Lookup Creator already lists unmanaged solutions for lookup creation. That query is private to that tool and drops managed solutions, which this tool must show as sources. Data Migration moves rows between two environments. This tool copies solution membership inside one environment.

Current registry (`desktop/src/ui/tools/registry.tsx`): `welcome`, `data-migration`, `fetchxml-builder`, `fetchxml-tester`, `plugin-registration`, `polymorphic-lookup-creator`, `workflow-activities-viewer`.

- Tool id: `solution-components-mover`
- Title: Solution Components Mover
- Tooltip: Copy solution components from one solution into another in the same environment
- `showInActivityBar`: true
- `allowMultipleInstances`: true
- One environment, through `useConnectionSelection` and `meta.connectionName`. No `meta.targetConnectionName`. `ConnectionInfo` already has `envUrl` and `crmType`. It does not have organization version. The sidecar reads that with `RetrieveVersionRequest`.
- Folder: `desktop/src/ui/tools/solution-components-mover/` with `tool.ts`, `api/`, `model/`, `components/`, and `tests/`. Register once in `desktop/src/ui/tools/registry.tsx`.
- Sidecar folder: `api/PowerTools/PowerTools.API/Tools/SolutionComponentsMover/`. Map it from `Program.cs` with `DataverseContextFilter` and `DataverseClientFactory`. Do not add `DataverseTargetContextFilter`.
- Status text through `useToolStatus`. Solution, component-type, and copy-job contracts stay private to the tool.
- Renderer calls `apiGet` and `apiPost` only. Opening a solution uses the existing platform `openExternalUrl` with `envUrl` and the classic `/tools/solution/edit.aspx?id={id}` path. Log export can be a browser download of the in-memory log. No new Electron IPC.
- Do not call `GET /api/metadata/entities` for this tool. That endpoint uses `RetrieveAllEntitiesRequest`, drops intersect and private tables, and does not return metadata id, schema name, or `IsManaged`.

New endpoints:

1. `GET /api/solution-components-mover/solutions`
   - Request: no body.
   - Response: `{ solutions: [{ id, friendlyName, uniqueName, publisherName, installedOn, version, isManaged }] }`
   - Dataverse: paged `QueryExpression` on `solution` with the published columns except `description`, the published filters (`isvisible` eq true, `uniquename` ne `Default`), `PageInfo.Count` 5000, `PageNumber` starting at 1, and `PagingCookie` until `MoreRecords` is false. Order by `solutionid` so pages are stable. `publisherName` is `publisherid.Name` and may be null. `installedOn` is an ISO timestamp.

2. `GET /api/solution-components-mover/component-types`
   - Response: `{ componentTypes: [{ componentType, label }] }`
   - Dataverse: `RetrieveVersionRequest`. `RetrieveOptionSetRequest` for `componenttype`. When major is at least 9 and minor is at least 1, page `solutioncomponentdefinition` where `canbeaddedtosolutioncomponents` eq true, columns `objecttypecode` and `primaryentityname`, ordered by `solutioncomponentdefinitionid`. Resolve each `primaryentityname` with `RetrieveMetadataChangesRequest` for `LogicalName`, `DisplayName`, and `SchemaName`. Label is the user-localized display name, then schema name, then the option-set user-localized label, then the first localized label. A definition whose table is missing stays in the list with the option-set label instead of failing the whole response. If code 80 is absent, include 80. Then add option-set values that are not already present. Sort by label. Below version 9.1, return the option set plus 80 when missing.

3. `POST /api/solution-components-mover/copies`
   - Request: `{ sourceSolutionIds: string[], targetSolutionIds: string[], componentTypes: number[], allComponents: boolean, checkBestPractice: boolean }`
   - Response: `{ jobId: string }`
   - Reject, before any add, when `sourceSolutionIds` is empty, `targetSolutionIds` is empty, or `allComponents` is false and `componentTypes` is empty. Reload the solution rows with endpoint 1's query. Unknown ids are a client error. Every target must be unmanaged. `checkBestPractice` defaults to true when omitted.
   - Dataverse: page `solutioncomponent` with columns `solutioncomponentid`, `solutionid`, `objectid`, `componenttype`, and `rootcomponentbehavior`, inner link alias `solution` with `ismanaged`, `solutionid` `In` the source ids, and `componenttype` `In` the selected codes unless `allComponents` is true. `Count` 5000, `PageNumber` from 1, cookie until `MoreRecords` is false, order by `solutioncomponentid`. Distinct the rows by `objectid` plus `componenttype` before adding. When `checkBestPractice` is true, run the published metadata check only for type 1, behavior 0, unmanaged source. A null `rootcomponentbehavior` does not match behavior 0 and does not throw. If any returned table has `IsManaged` true, return that failure and do not call `AddSolutionComponent`. Name the managed tables from that metadata result, display label then schema name. Chunk the `MetadataId` `In` list only if a single request faults on size.
   - Then enqueue an in-memory job, same idea as Data Migration's job id, owned by this tool. For each target unique name and each distinct component, `Execute` `AddSolutionComponentRequest` with `AddRequiredComponents` false, `ComponentId`, `ComponentType`, and `SolutionUniqueName`. When major is at least 8, set `DoNotIncludeSubcomponents` true for `rootcomponentbehavior` 1 or 2. For component type 380, always set `DoNotIncludeSubcomponents` true and `IncludedComponentSettingsValues` to an empty string array after that. Catch each fault, store the message, and continue. Do not send `xaml` or other component bodies to the client.

4. `GET /api/solution-components-mover/copies/{jobId}`
   - Response: `{ status, processed, total, succeeded, failed, entries: [{ componentId, componentType, label, solutionUniqueName, succeeded, message }] }`
   - Unknown job id returns 404. `label` uses the component-type label from endpoint 2. Online (`crmType` `online`, or version at least 9.1 when the definition list exists) prefers the definition's table label, matching the published online branch. On-premises below 9.1 uses the option-set label.

### Recommended implementation

1. Contracts and API. Add the solution, component-type, and copy-job types under `Tools/SolutionComponentsMover/`. Implement the paged solution query, the version-gated type list, and the copy job. Register `MapSolutionComponentsMoverEndpoints()` in `Program.cs` next to the other tool maps. Cover the `Default` and `isvisible` filters, managed versus unmanaged targets, paging past 5000 components, a null `rootcomponentbehavior` with the check off, the managed-table refusal before any add, behavior 0 versus 1 and 2, the type 380 empty settings array, a per-component fault that leaves earlier adds in place, and duplicate source rows added once. Use a fake organization service. Do not copy the plugin source into these tests.
2. Tool module. Add `desktop/src/ui/tools/solution-components-mover/tool.ts` with the id, title, and tooltip above. Load solutions and component types for the selected connection. Let the user filter and multi-select sources and unmanaged targets, choose types, and leave the best-practice check on by default. Start the copy job and poll it. Show per-component success and failure, and publish counts with `useToolStatus`. Open a solution through `openExternalUrl`.
3. Registry. Add the tool to `BUILT_IN_TOOLS` in `desktop/src/ui/tools/registry.tsx`.
4. Tests. Add renderer tests for managed sources, hidden managed targets, a type subset, the best-practice failure with no job progress, a mixed success and failure log, and a Dataverse error on load. Run the sidecar tests for the new project and the desktop tool tests. Do not call a live environment.

License and copy limits: GPL-3.0. Inspiration only. Do not copy source, WinForms layout, icons, or the plugin's labels and dialog text. Do not vendor the NuGet package or its base64 images. Implementation of steps 1-4 waits on an explicit acceptance of that license impact.

Risks: `AddSolutionComponent` changes the target immediately and a later failure leaves a partial copy. `AddRequiredComponents` false does not bring in dependencies. The 380 empty-array behavior is what the plugin relies on and still needs a live check that an empty array excludes the value. `rootcomponentbehavior` 2 is treated like 1. Classic `edit.aspx` may not open the modern maker editor. `IncludedComponentSettingsValues` can fault on an organization older than the property, and that fault should stay on that component's log line. Service-protection faults are per-component errors because the plugin does not retry.

### UX

#### Sidebar

- Tool id `solution-components-mover`. Show it in the activity bar (`showInActivityBar: true`).
- Title: **Solution Components Mover**. Tooltip: **Copy solution components from selected solutions into unmanaged solutions in the same environment**. That tooltip is the activity-bar button `title` and accessible name. The entry is one row under the existing Search tools field.
- More than one tab (`allowMultipleInstances: true`). Choosing the tool again opens another tab. Each tab keeps its own filter, sort, source checks, target checks, focused solution, best-practice checkbox, and log. Each tab follows the selected environment.
- Icon: a new monochrome SVG. The activity bar already inverts sidebar icons. Do not reuse an XrmToolBox plugin icon.

#### Title bar

No title-bar menu item. Leave File, Edit, View, and Help unchanged. Copy, refresh, export, and clear stay on the tool tab. Opening a solution is a double-click on its row.

#### Tool tab

One surface on `bg-[var(--color-bg-dark)]`. The environment is the connection already chosen in the sidebar footer. The tab shows one environment.

The surface stacks two views and splits them with a draggable divider so both tables keep the full width. Use `Group`, `Panel`, and `Separator` from `react-resizable-panels`, with `orientation="vertical"`. The top `Panel` is the solution list (`minSize="30%"`). The bottom `Panel` is the copy log (`minSize="20%"`). The `Separator` accessible name is `Resize panes`. Its classes are `h-1 cursor-row-resize bg-[var(--color-bg-light)]`, with `hover:bg-[var(--color-primary)]` and `active:bg-[var(--color-primary)]`. Either view stays reachable. A fixed half height or a static border is not the divider.

A toolbar on `bg-[var(--color-bg-darker)]` sits above the split. The best-practice `Checkbox` stays on the left. On the right are an icon button **Refresh solutions** and `Button` **Copy components** (primary). The refresh control is an icon whose accessible name is `Refresh solutions`. Both panes use `bg-[var(--color-bg-darker)]`. Primary text is `text-[var(--color-text-white)]`. Secondary text is `text-[var(--color-text-gray)]`. Muted text is `text-[var(--color-text-dark-gray)]`.

1. **No environment.** Both panes show one message: select an environment from the connection control at the bottom of the tool sidebar. The filter, **Refresh solutions**, and **Copy components** are disabled. Do not load solutions.
2. **Solutions.** After an environment is selected, load visible solutions in that environment. Omit the solution whose unique name is `Default`. `SearchInput` placeholder `Filter solutions`. The filter keeps a row when any displayed value contains the text, compared case-insensitively: friendly name, unique name, publisher name, installed date, version, and the managed flag.
3. **Sort.** Sorting is a click on a `DataTable` column header. Headers are title case, not uppercase: Source, Target, Display Name, Name, Publisher, Installed, Version, Managed. Source and Target are not sortable. The first click on Display Name, Name, Publisher, Installed, Version, or Managed sorts that column ascending. The same header again sorts it descending. The sorted header sets `aria-sort`. Installed sorts as a date when both values parse, and as text otherwise. Every other sortable column sorts as text. The default, before the user chooses, is Display Name ascending. There is no separate row of sort buttons.
4. **Table.** `DataTable` columns: Source, Target, Display Name, Name, Publisher, Installed, Version, Managed. Display Name is the solution friendly name. Name is the solution unique name. The row key is the solution id. Source and Target render a `Checkbox`. Source can be checked on managed and unmanaged rows. Target can be checked only on unmanaged rows. On a managed row the target checkbox is disabled and unchecked, and its accessible name says a managed solution cannot be a target. Managed displays **Managed** or **Unmanaged**. An empty publisher cell is blank. Row focus uses `selectedKey`. Checking a box updates that source or target set and leaves the focused row unchanged. Double-clicking a solution row opens `{environment url}/tools/solution/edit.aspx?id={solution id}` for that solution. Checking a box does not open the browser. **Refresh solutions** reloads the solution list for the current environment.
5. **Best practice.** The toolbar checkbox is checked by default. Label: **Block a copy that would add a fully included managed table from an unmanaged source.** With it checked, that situation refuses the whole copy before any add. With it unchecked, those components are copied with the rest.
6. **Copy.** **Copy components** is enabled when at least one source and one unmanaged target are checked, solutions are loaded, and a copy is not already running. It opens a `Modal` titled **Component types**. The modal lists types in a `DataTable` with a `Checkbox` and the type label. Every type starts checked each time the modal opens. `Button` **Select all**, **Clear all**, and **Invert** (secondary) change those checks. **Invert** flips every box. `Button` **Copy** (primary) is enabled when at least one type is checked. `Button` **Cancel** (secondary) closes the modal and copies nothing. When every type is checked, the copy includes every component. When a subset is checked, the copy includes only those types. Confirming **Copy** closes the modal, clears the log, and starts this run.
7. **Log.** The bottom pane has `Button` **Clear** and `Button` **Export** (secondary), then a `ProgressBar` while a copy is running, then a `DataTable` of this run. Columns: Component, Target solution, Result, Detail. Result is the word **Succeeded** or **Failed**. Detail is empty on success and the failure text on failure. Each add is one row. A failed add still leaves earlier rows in place, and later adds continue. **Clear** removes the log rows and does not undo adds. **Export** downloads the visible log as text from this tab. The log heading shows the environment name for the run, in `text-[var(--color-text-dark-gray)]`.

Changing the selected environment while no copy is running reloads solutions, resets sort to Display Name ascending, and clears the filter, source checks, target checks, and focused row. The log stays until **Clear**, **Export**, or the next confirmed copy, with the environment name still on its heading. A copy already running keeps recording into that log and is not applied to the newly selected environment. The solution list reloads for the new environment. **Copy components** stays disabled until that reload finishes and the running copy has finished.

#### States

- **Loading.** `Spinner` in the pane that is loading. A solution load publishes `Loading solutions…` with `useToolStatus` and disables **Copy components** and **Refresh solutions**. The component-type modal uses `busy` and `Spinner` while types load, with busy label `Loading component types…`, and publishes that same string. During a copy, `ProgressBar` advances for each success and each failure, the log stays visible, and status is `Copying components…`.
- **Empty.** No environment: the message in step 1, and status `No environment selected`. No solutions after the load: `DataTable` empty message `No solutions`. A filter with no matches: `No matching solutions`. No component types: modal empty message `No component types`, and **Copy** stays disabled. No log rows: `No copy results`.
- **Success.** When every add succeeded and at least one add ran, `useToast` success `Copy finished`. When the run finishes with nothing to add, `useToast` info `No components to copy`. Status becomes `Copy finished: N succeeded, 0 failed`. The log lists each successful add. A finished load publishes `N solutions` and does not raise a toast. Double-clicking a solution does not raise a success toast.
- **Error.** A solution-load failure clears the table, shows the failure text in the top pane, offers `Button` **Retry** (secondary), publishes `Could not load solutions`, and raises `useToast` type `error`. A type-load failure leaves the solution list in place, shows the text in the modal with **Retry**, publishes `Could not load component types`, and raises an error toast. **Cancel** still closes the modal. The best-practice refusal adds no components: one log row, Result **Failed**, Detail the refusal text, `ProgressBar` at zero, status `Copy refused`, and an error toast with that text. A per-item failure is a **Failed** log row. The run continues, and earlier successes stay. When the run ends with a mix of results, `useToast` info `Copy finished with failures`. When every add failed, `useToast` error `Copy finished with no successes`. Status in both cases is `Copy finished: N succeeded, M failed`. A double-click that cannot open the browser raises an error toast and leaves the tab as it is. Toast already styles `error`. The palette has no separate success or error color, so the log uses the words Succeeded and Failed.

#### Shared controls

- `Button` — Copy components, Select all, Clear all, Invert, Copy, Cancel, Clear, Export, and Retry. Refresh solutions is an icon button on the toolbar, not a shared control.
- `Checkbox` — the best-practice check, source selection, target selection, and component-type selection.
- `DataTable` — the solution list, the component-type list, and the copy log.
- `Modal` — the component-type choice before a copy.
- `ProgressBar` — the running copy.
- `SearchInput` — the solution filter.
- `Spinner` — solution load and component-type load.
- `Toast` and `useToast` — copy results and failures.
- `useToolStatus` — the status strings above. The tool does not choose status ids.

#### Colors

`bg-[var(--color-bg-dark)]` for the tab, `bg-[var(--color-bg-darker)]` for the toolbar and both panes, `bg-[var(--color-bg-light)]` for the divider, `hover:bg-[var(--color-primary)]` and `active:bg-[var(--color-primary)]` on that divider, `text-[var(--color-text-white)]` for primary labels, `text-[var(--color-text-gray)]` for values and the refresh icon, `text-[var(--color-text-dark-gray)]` for the log environment and empty copy, and `bg-[var(--color-hover-bg)]` for the focused solution row and the refresh hover. No hex values.

#### What not to build

- A File, Edit, View, or Help command for this tool.
- A second environment, a compare, or a copy from one environment into another.
- Publishing the target solution.
- Removing components from a source solution, or rolling back adds that already succeeded.
- The solution whose unique name is `Default`, or a target checkbox that can be checked on a managed solution.
- A list of individual components to pick one by one. The choice is component type.
- Editing solution metadata, publishers, or versions.
- Solution deduplication, or a table-integrity check.
- The plugin's docked source picker and target picker, its always-visible type checkbox panel, and its fixed log text box. This tab is one solution table and a log pane, with types in a modal.
- A separate row of sort buttons, all-capital column headers, an Open in browser toolbar button, and the line "Copy leaves every source solution unchanged."
- A shared select, text field, or any new control in `desktop/src/ui/shared/ui`.
- XrmToolBox host chrome, the plugin icon, or the plugin's labels and dialog text.
- A connection picker inside the tab.

### Open questions

- **GPL-3.0.** The source plugin is GNU General Public License v3.0 (copyleft). Accept this license impact before implementation. Reimplement the behavior in ### What it does. Do not copy the plugin source, WinForms layout, icons, or unique copy into this MIT-licensed repository.

- **GPL-3.0 acceptance.** Match records GNU General Public License v3.0. Accept that copyleft impact before implementation. Reimplement the Dataverse behavior from this brief. Do not copy the plugin source, WinForms UI, icons, or unique copy into the MIT-licensed repository.
- Resolved: the add-tool request accepts a clean-room implementation and no plugin source was copied.

### Dataverse review

Evidence is Microsoft Learn, not the plugin. Add message: [AddSolutionComponentRequest](https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.sdk.messages.addsolutioncomponentrequest?view=dataverse-sdk-latest) and [AddSolutionComponent](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addsolutioncomponent?view=dataverse-latest). Settings array: [IncludedComponentSettingsValues](https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.sdk.messages.addsolutioncomponentrequest.includedcomponentsettingsvalues?view=dataverse-sdk-latest). Component choice and `rootcomponentbehavior`: [solutioncomponent table](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/solutioncomponent). Definition column used as the add type: [Power Pages solution component types](https://learn.microsoft.com/en-us/power-pages/configure/power-platform-cli-solution-management). Paging: [Page results using QueryExpression](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/org-service/queryexpression/page-results). Metadata query: [RetrieveMetadataChanges](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrievemetadatachanges?view=dataverse-latest) and [Query table definitions](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api). Throttling: [Service protection API limits](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/api-limits). Table segmentation: [Segmented solutions](https://learn.microsoft.com/en-us/power-platform/alm/segmented-solutions-alm). Environment variable value: [Environment variables FAQ](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/environment-variables-faq). Block unmanaged customizations: [Block unmanaged customizations](https://learn.microsoft.com/en-us/power-platform/alm/block-unmanaged-customizations). Solution columns and the Default solution id: [solution table](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/solution) and [Work with solutions](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/work-solutions?view=op-9-1).

#### Corrections to messages, metadata, paging, and batching

`AddSolutionComponent` / `AddSolutionComponentRequest` is the right message. Required arguments are `ComponentId`, `ComponentType`, `SolutionUniqueName`, and `AddRequiredComponents`. `AddRequiredComponents` false does not add required components. For a table, `ComponentId` is the table `MetadataId`, which is `solutioncomponent.objectid`. The message adds a component that already exists in the environment. It does not publish and it does not remove the source row. `UpdateSolutionComponent` is a different message and is not the copy.

`DoNotIncludeSubcomponents` true excludes subcomponents. The property page sentence that says true includes subcomponents contradicts the property name. Follow the name. Leave the property false for `rootcomponentbehavior` 0 and for a null behavior. The choice values are 0 Include Subcomponents, 1 Do not include subcomponents, and 2 Include As Shell Only. The behavior column is optional and its default form value is -1, so null is not 0.

`IncludedComponentSettingsValues` null, or omitted, adds the component with metadata. An empty array adds it with no metadata settings. A non-empty array is not a documented setting picker. The remarks say a future SDK will allow specific setting names. Behavior 1 is exclude subcomponents and keep metadata: `DoNotIncludeSubcomponents` true and the settings array left unset. Behavior 2 is the shell: `DoNotIncludeSubcomponents` true and `IncludedComponentSettingsValues` set to an empty string array. Setting only `DoNotIncludeSubcomponents` for both 1 and 2 stores behavior 2 as behavior 1.

Component type 380 is Environment Variable Definition and 381 is Environment Variable Value on the current `componenttype` choice. The type 380 override still applies after the behavior mapping: `DoNotIncludeSubcomponents` true and an empty settings array, including when the source behavior is 0 or 1. That is the documented "no metadata settings" contract. It is not a documented environment-variable API. The maker way to keep a current value out of a solution is Remove from this solution on Current Value. Whether an empty array drops only the 381 row is unverified.

The published `componenttype` choice list has no value 80. It does include 300, 371, 372, 380, 381, and 430–432. Microsoft also says newer component types are absent from that global choice. `AddSolutionComponent` needs the integer anyway. On the definition path, that integer is `solutioncomponenttype`. The Power Pages article selects `name,solutioncomponenttype` from `solutioncomponentdefinitions` and passes `solutioncomponenttype` to add-solution-component. The plugin reads `objecttypecode` and uses it as `componenttype`. Endpoint 2 returns `solutioncomponenttype` as `componentType`, because that is the integer Microsoft's sample passes to the add operation. Whether those two columns are equal on a given row was not checked against a live organization. Keep `primaryentityname` for the label lookup and `canbeaddedtosolutioncomponents` eq true as the filter. Neither column is on a published entity reference page (`solutioncomponentdefinition` returns 404). Also select `name`, which is documented, and use it only after the table display name, schema name, and option-set labels. Do not insert a hardcoded 80 on the 9.1 path. If both the definition query and the option set omit 80, the organization is not advertising that type.

`RetrieveVersionRequest` is the version source. The 9.1 gate is major greater than 9, or major equal to 9 and minor at least 1. `major >= 9 && minor >= 1` treats version 10.0 as older than 9.1. `DoNotIncludeSubcomponents` stays gated at major at least 8. Below 9.1, return the `componenttype` option set only. Do not synthesize 80 when that option set lacks it. The historical label "App Module" is not in the current choice list.

`RetrieveOptionSetRequest` with `Name` `componenttype` is the global choice behind `solutioncomponent.componenttype`. `RetrieveMetadataChangesRequest` with `ClientVersionStamp` null returns every row that matches the filter, not a delta. `MetadataId` In and `IsManaged` eq true are valid metadata conditions. Request `MetadataId`, `DisplayName`, `LogicalName`, `SchemaName`, and `IsManaged`. There is no metadata paging cookie. Name managed tables from that filtered result, display label then schema name.

Paging for `solution`, `solutioncomponent`, and `solutioncomponentdefinition` is `PageInfo.Count` 5000, `PageNumber` starting at 1, then `PagingCookie` and `PageNumber++` while `MoreRecords` is true. Standard tables return at most 5,000 rows. An unset `Count` still returns up to 5,000. It does not return an empty page. `QueryExpression` does not add a primary-key order. Order `solution` by `solutionid` and `solutioncomponent` by `solutioncomponentid`. Order definitions by `name` if `solutioncomponentdefinitionid` is not present. The entity reference does not publish that primary-key name. One `RetrieveMultiple` without a cookie stops at the first page and looks complete.

Each add is one `Execute`. Do not wrap the copy in `ExecuteMultiple` or `ExecuteTransaction`. `ExecuteMultiple` allows 1,000 requests and is still not one transaction. A successful add is committed before the next component runs.

`installedon` is DateOnly, UserLocal. Return `installedOn` as `yyyy-MM-dd`. `publisherid` is required. `publisherid.Name` may still be null. Do not fail the solution list on a null name. `friendlyname`, `uniquename`, `version`, `ismanaged`, and `isvisible` match the solution table. Omitting `description` is fine. The documented Default solution id is `FD140AAF-4DF4-11DD-BD17-0019B9312238`. Filtering `uniquename` ne `Default` and `isvisible` eq true matches the plugin and that solution.

Job labels follow the same version gate as endpoint 2. When the definition list was loaded, prefer the definition label. `crmType` online is not a second rule. On-premises 9.1 has the definition table and should use those labels.

#### Privileges and connection requirements

The caller is the signed-in connection user. `WhoAmI`, `CallerId`, and impersonation are not part of this copy. [AddSolutionComponentRequest](https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.sdk.messages.addsolutioncomponentrequest?view=dataverse-sdk-latest) says the caller must have the System Administrator or System Customizer role. The action page does not list `prv*` names. Listing needs Read on `solution` and `solutioncomponent`. The inner link to `solution` fails the component query when that read is denied. The 9.1 path also needs Read on `solutioncomponentdefinition`. Option-set and metadata reads need metadata access, which those two roles have. Environment Maker is not the documented add role.

#### Online versus on-premises

`RetrieveMultiple`, `RetrieveVersion`, `RetrieveOptionSet`, `RetrieveMetadataChanges`, and `AddSolutionComponent` exist on both. `solutioncomponentdefinition` is queried at Web API v9.1 in Microsoft's sample. Query it only when the organization version is at least 9.1. On-premises 8.2 does not have that table. Current Dataverse online is past 9.1. `IncludedComponentSettingsValues` is on the current SDK contract. A server that rejects the parameter faults that component. Whether on-premises 8.x accepts the property was not verified.

Block unmanaged customizations is a Power Platform environment setting. It is not an on-premises product switch. When it is on, unmanaged adds fail with "This environment doesn't allow unmanaged customizations. This was a choice made by your admin, and certain actions won't be available or will be view only." Stop the job on that fault. Further adds fail the same way.

`/tools/solution/edit.aspx?id={solution id}` is the plugin and on-premises web-client path. It is not documented as the current online solution editor. Online solutions open in the Power Apps maker portal. Whether the classic URL still redirects online was not verified.

#### Solution and managed limits

`AddSolutionComponent` adds to an unmanaged solution. A managed `SolutionUniqueName` is rejected by the server. Reject managed targets before any add. Managed components may be added to an unmanaged solution. `EntityMetadata.IsManaged` does not make `AddSolutionComponent` fail. The best-practice check is client policy. It matches the segmentation guidance to avoid Include all objects for a managed table such as an out-of-box table. Microsoft still allows that add. The check is narrower than the full guidance, which also says to avoid Include all objects for an unmanaged table that already exists in a downstream environment. This tool copies inside one environment, so keep the check as specified: type 1, behavior 0, unmanaged source, and `IsManaged` true, before any add.

The documented Active solution id is `FD140AAE-4DF4-11DD-BD17-0019B9312238`. The add remarks use it only to find the active ribbon customization. The list filter does not exclude it. If that solution is visible and unmanaged, the copy endpoint would accept it as a target. Whether `AddSolutionComponent` accepts it was not verified.

Solution Component Framework type codes above 1000 can differ by environment. This tool reads and writes them in the same organization, so the code from endpoint 2 is the code to send back. Do not reuse those codes against another environment.

All unmanaged solutions in one environment share the active layer. Copying into several unmanaged targets does not create isolated layers. `AddRequiredComponents` false leaves dependencies out of the target solution even when those components already exist in the environment.

#### Failure modes

- Empty source ids, empty target ids, or a type subset with no codes: reject before `ConditionOperator.In`. An empty `In` list faults the query.
- Unknown solution id, or a managed target: client error, no add.
- Best-practice hit: return the managed table names from the filtered metadata and do not call `AddSolutionComponent`. A null `rootcomponentbehavior` does not match behavior 0 and does not throw.
- Component already in the target, or added again because a behavior-0 root already pulled that child in: that add faults. `rootsolutioncomponentid` marks child rows. Distinct on `objectid` plus `componenttype` does not remove children. The exact already-exists error code is not on the action page.
- Service protection: 6,000 requests, 1,200 seconds of execution, and 52 concurrent requests per user per web server in a 300-second window. The SDK fault is `-2147015902` (`0x80072322`), with `Retry-After` in `OrganizationServiceFault.ErrorDetails`. Wait that duration and retry the same add. Do not record it as a finished failure and do not start the next component while the window is closed.
- Block unmanaged customizations: stop the job. The message is environment-wide.
- Unknown `IncludedComponentSettingsValues` on an older server: that component's log line, then continue.
- One add commits immediately. A later fault leaves the earlier adds in place. There is no rollback.
- A solution or definition query that ignores `MoreRecords` stops at 5,000 rows and looks complete.
- `AddRequiredComponents` false does not pull dependencies into the target. A later export can miss them.

#### Plugin claims that are wrong

- `solutioncomponentdefinition.objecttypecode` is the integer to send as `AddSolutionComponent` `ComponentType`. Microsoft's sample passes `solutioncomponenttype`.
- Version at least 9.1 means major at least 9 and minor at least 1. Version 10.0 fails that test. The comparison is major greater than 9, or major 9 and minor at least 1.
- `rootcomponentbehavior` 2 is preserved by `DoNotIncludeSubcomponents` true alone. Shell-only also requires an empty `IncludedComponentSettingsValues`. Behavior 1 leaves that array unset.
- Paging with `Count` left at 0 skips or repeats because the page size is 0. An unset count still returns up to 5,000 rows. The loop is still wrong because `PageNumber` starts at 0 and the documented loop starts at 1 with an explicit order.
- The best-practice failure names the first rows of the unfiltered metadata collection. Names come from the managed metadata that matched the filter.
- A null `rootcomponentbehavior` aborts the copy while the check is off. The column is optional. Null is not behavior 0.
- Code 80 must be inserted when the list lacks it. The current `componenttype` choice list has no 80. On 9.1 and later the definition row supplies the type when it can be added.
- Any add fault, including service protection, is a finished per-component error and the next add runs immediately. `0x80072322` waits for `Retry-After`. The block-unmanaged message stops the job.
- Add permission is an unspecified customize privilege. The documented requirement is the System Administrator or System Customizer role.
- The progress label uses the connection's online flag even when on-premises 9.1 loaded definitions. The label source is the version gate.

#### Plugin claims that remain unverified

- An empty `IncludedComponentSettingsValues` on type 380 excludes only the environment variable value and leaves the definition metadata in place. Learn documents the empty array as no metadata settings, and documents removing the current value in the maker UI.
- `primaryentityname`, `canbeaddedtosolutioncomponents`, and the definition primary-key name. The entity reference page returns 404. `name` and `solutioncomponenttype` are the columns Microsoft's sample selects.
- Whether `objecttypecode` and `solutioncomponenttype` are equal for older platform types such as Entity (1).
- The exact fault code when the component is already in the target solution.
- `AddSolutionComponent` against the Active solution `FD140AAE-4DF4-11DD-BD17-0019B9312238`.
- `IncludedComponentSettingsValues` on on-premises builds older than the current online contract.
- A numeric cap on `ConditionOperator.In` or on a `MetadataId` In list. Chunk the metadata id list only when a request faults on size. Do not invent a chunk size.
- Whether `{environment url}/tools/solution/edit.aspx?id={solution id}` still opens a solution in Dataverse online.

### Implementation notes and test evidence

- Files and endpoints added:
  - `api/PowerTools/PowerTools.API/Tools/SolutionComponentsMover/` with `MapSolutionComponentsMoverEndpoints()` registered in `Program.cs` under `DataverseContextFilter` and `DataverseClientFactory`. No `DataverseTargetContextFilter`.
  - In-memory copy jobs and `SolutionCopyJobRunner`, owned by this tool, following the Data Migration job shape.
  - `api/PowerTools/PowerTools.API.SolutionComponentsMover.Tests/` added to `PowerTools.sln`.
  - `desktop/src/ui/tools/solution-components-mover/` (`tool.ts`, `api/`, `model/`, `components/`, `tests/`) and one `BUILT_IN_TOOLS` entry in `desktop/src/ui/tools/registry.tsx`.
  - Endpoints:
    - `GET /api/solution-components-mover/solutions`
    - `GET /api/solution-components-mover/component-types`
    - `POST /api/solution-components-mover/copies`
    - `GET /api/solution-components-mover/copies/{jobId}`
- Behavior taken from the brief, including the Dataverse corrections:
  - Solutions are paged at 5,000 from page 1, ordered by `solutionid`, with `isvisible` true and `uniquename` not `Default`. `installedOn` is `yyyy-MM-dd`. A null publisher name does not fail the list.
  - The 9.1 gate is major greater than 9, or major 9 and minor at least 1, so 8.2 and 9.0 return the `componenttype` option set only and 9.1 and 10.0 read `solutioncomponentdefinition`. `componentType` is `solutioncomponenttype`. Labels fall through display name, schema name, option-set labels, then definition name. A missing table does not fail the response. Code 80 is not inserted.
  - `RetrieveOptionSetRequest` comes from `Microsoft.Xrm.Sdk.Messages`. Its constructor sends `MetadataId` as `Guid.Empty` together with `Name` = `componenttype` and `RetrieveAsIfPublished` false. A late-bound request that sends only `Name` is rejected with `Required field 'MetadataId' is missing`. `RetrieveMetadataChanges` is still sent by request name.
  - Copy rejects an empty source list, empty target list, or a type subset with no codes before any `In` condition. Unknown ids and managed targets are client errors before any add. `checkBestPractice` defaults to true.
  - Components are paged, then distinct on `objectid` plus `componenttype`. A null `rootcomponentbehavior` does not match behavior 0 and does not throw.
  - The best-practice check runs only when requested, before any add, for type 1, behavior 0, and an unmanaged source. Managed table names come from that filtered metadata result. A metadata `In` list is split only after a size fault.
  - Each add is its own `AddSolutionComponent` execute. Behavior 0 or null leaves subcomponents and settings unset when the organization major is at least 8. Behavior 1 sets `DoNotIncludeSubcomponents` and leaves the settings array unset. Behavior 2 also sets an empty settings array. Type 380 forces both after that mapping, including below version 8.
  - Fault `-2147015902` waits for `Retry-After` and retries that add. Tests use a delay double that records the wait and does not sleep. The block-unmanaged message stops the job. Any other per-component fault is stored and the loop continues.
  - Job labels use the same version gate as the component-type list. Unknown job ids return 404.
  - The tab is one environment, a vertical split, the solution table, the component-type modal, and the copy log described in the UX section. The renderer calls `apiGet` and `apiPost` with `meta.connectionName`. Double-clicking a solution uses `openExternalUrl`. Refresh reloads the solution list. Log export is a browser download.
- Commands run and their results:
  - `dotnet test api/PowerTools/PowerTools.API.SolutionComponentsMover.Tests/PowerTools.API.SolutionComponentsMover.Tests.csproj -p:UseAppHost=false` — Passed, 24 tests.
  - From `desktop/`: `npm test` — Passed, 58 files, 286 tests.
  - From `desktop/`: `npm run lint` — Passed.
  - From `desktop/`: `npm run build` — Passed.
  - From `desktop/`: `npm run check` — Passed (typecheck, lint with max warnings 0, test, renderer build, and the desktop smoke test).
- Any check you could not run: None. The new tool was exercised with MSW and a fake organization service. No live Dataverse environment was required.
