### Match

- Plugin name: Workflow Activities Viewer. Catalog URL: https://www.xrmtoolbox.com/plugins/WorkflowActivitiesViewer/. NuGet id: `WorkflowActivitiesViewer`. Author: BioProfe.
- Catalog description: "Workflow Activities Viewer is used to see the code activities dependencies visually. That is, when you select a code activity, you will see what workflows execute this code activity." Latest catalog version: `1.2019.9.6` (released 2020-11-12, 29672 downloads of that version, 41824 downloads across versions). Open source: true. Catalog tag: Processes. NuGet tags: `XrmToolBox Plugin Workflow Activities Viewer`. Project URL: https://github.com/BioProfe/WorkflowActivitiesViewer.
- NuGet `1.2019.9.6` release notes: `1.2019.9.3` fixed a workflow-name width bug; `1.2019.9.4` removed an unneeded notification; `1.2019.9.5` changed the plugin description; `1.2019.9.6` shows the category of each workflow. The package depends on XrmToolBox `>= 1.2020.1.40` and targets .NET Framework 4.6.2.
- Source read in two places. The GitHub default branch `master` at `05fb743cbb2dcdf6267d4c244b1fefead576f77d` (2019-10-07, "Update README.md") is assembly version `1.2019.9.2` (`Properties/AssemblyInfo.cs` 35-36). That tree does not contain the published `1.2019.9.6` category change. The behavior users actually run was read from ILSpy output of the NuGet binary `lib/net462/Plugins/WorkflowActivitiesViewer.dll`, whose assembly and file version are `1.2019.9.6`.
- License: **GNU General Public License v3.0 or later (GPL-3.0-or-later)**. The NuGet license expression is `GPL-3.0-or-later`. The GitHub license API reports `GPL-3.0`. This is copyleft. Power Tools must not copy this plugin's source, WinForms UI, icons, or unique copy into the MIT-licensed repo. Treat the plugin as inspiration only. Reimplement the described Dataverse behavior from this brief. Do not start that implementation until the license impact is accepted.
- Related catalog overlap, not used as the source: Workflows Viewer (author BioProfe, NuGet `WorkflowsViewer`, latest `1.2019.9.95`, open source, https://github.com/BioProfe/WorklowsViewer, also GPL-3.0). It shows workflow-to-workflow dependencies. Its source was not read. Power Tools Plugin Registration already lists `pluginassembly` and `plugintype` rows for step registration. It does not answer which processes run a custom workflow activity.
- Confidence: high for the published `1.2019.9.6` queries, category map, and match rule, because those were read from the binary. Medium for anything the GitHub tree still shows that the binary replaced. The current Dataverse label for workflow category `6` was not checked against a live organization.

### What it does

- Lists custom workflow activities from database-stored plug-in assemblies, grouped by assembly name.
- Filters that list by a case-insensitive substring of the activity name. An empty filter collapses every assembly. Any other filter expands the assemblies that still have a match.
- Selecting an activity shows its name, created-on and created-by, and modified-on and modified-by.
- Parses the activity's `customworkflowactivityinfo` XML into input argument names and output argument names.
- Shows activated process definitions whose XAML contains that activity name: process name, category, primary table, created on, modified on, and start conditions (on demand, record created, named columns changed, record deleted).
- Says when an activity has no matching process, and when a matching process has none of those start conditions.
- Reloads activities and processes when the environment changes and when the user refreshes.
- Requires one selected environment. It does not edit processes, assemblies, or activities, and it does not compare two environments.
- The GitHub description says selecting a process shows the code activities that process runs. `1.2019.9.2` leaves that click handler empty. `1.2019.9.6` has no process click handler. That reverse direction is not a shipped capability.

### Backend findings

Published behavior below is `WorkflowActivitiesViewer.dll` `1.2019.9.6` unless a line is explicitly the GitHub `1.2019.9.2` file. There are no plugin tests. The live Dataverse calls are two `RetrieveMultiple` requests. There is no `Create`, `Update`, `Delete`, `Associate`, `ExecuteMultipleRequest`, `ExecuteTransactionRequest`, `WhoAmI`, impersonation, solution, or publish message.

**Activities.** `FillAssemblies` (`WorkflowActivitiesViewerControl.cs` 67-145 in the GitHub file; the same query is the decompiled method at lines 100-141) calls `service.RetrieveMultiple` with a `FetchExpression` on `plugintype`. Columns: `plugintypeid`, `name`, `typename`, `createdon`, `modifiedon`, `createdby`, `modifiedby`, `version`, `pluginassemblyid`, `customworkflowactivityinfo`, `assemblyname`. Filter: `isworkflowactivity` equals `1`. Inner link to `pluginassembly` on `pluginassemblyid`, alias `al`, with `sourcetype` equals `0` and no linked columns. Order: `assemblyname` descending. `sourcetype` `0` is Database in the SDK `pluginassembly` option set, so Disk (`1`) and Normal (`2`) assemblies are excluded. Rows with a null `assemblyname` are skipped. The link alias is unused.

Each remaining row becomes an activity. `plugintypeid` is stored lowercased. `createdby` and `modifiedby` keep `EntityReference.Name` only. `customworkflowactivityinfo` is stored only when the attribute is present and non-null. Activities are grouped by the `assemblyname` string, not by `pluginassemblyid`. The assembly id kept for a group is the `pluginassemblyid` of the first row seen for that name. Two assemblies that share a name collapse into one group. After the query, the group list is sorted by name ascending (`GFG.Compare`, GitHub `WorkflowActivitiesViewerControl.cs` 1007-1018). A null side compares as equal. Activities inside a group stay in query order.

**Processes.** GitHub `1.2019.9.2` `FillWorkflows` (`WorkflowActivitiesViewerControl.cs` 147-213) queries `workflow` for `workflowid`, `primaryentity`, `name`, `createdon`, `modifiedon`, `type`, `ondemand`, `triggeroncreate`, `triggeronupdateattributelist`, `triggerondelete`, `subprocess`, and `xaml`, ordered by `name` ascending, with all of these conditions: `type` equals `1` (Definition), `ownerid` not null, `rendererobjecttypecode` null, `category` equals `0` (classic workflow only), `statecode` equals `1` (Activated), `primaryentity` not null. `xaml` is lowercased with no null check, so a null `xaml` throws and aborts the load.

Published `1.2019.9.6` `FillWorkflows` (decompiled `WorkflowActivitiesViewerControl.cs` 143-222) keeps that column list and adds `category`. The category condition changes from equals `0` to not null. The other conditions stay. A null or missing `xaml` becomes an empty string inside a try/catch (decompiled lines 207-221). `workflowid` is lowercased. `triggeronupdateattributelist` is optional. `type` is retrieved and not displayed. `subprocess` is stored and not displayed.

Category integers are hardcoded (decompiled `WorkflowActivitiesViewerControl.cs` 173-196 and `WORKFLOW_CATEGORY_TYPES.cs` 3-12): `0` Workflow, `1` Dialog, `2` Business Rule, `3` Action, `4` Business Process Flow, `5` Modern Flow, `6` Reserved. There is no default arm, so any other value leaves the category text empty. Public Dataverse documentation currently labels category `6` Desktop Flow. That label was not verified on a live organization. The plugin's "Reserved" text is what `1.2019.9.6` shows.

**Match rule.** On selection, if the activity's process list is still empty, every loaded process is kept when its lowercased `xaml` contains `plugintype.name` lowercased (GitHub `WorkflowActivitiesViewerControl.cs` 525-538; decompiled lines 526-536). The match does not use `typename`, `plugintypeid`, or `friendlyname`. It is a raw substring, so a short name matches a longer name, and a name that never appears in the XAML is a miss even when the process runs that type under another identifier. The list is cached on the activity for the rest of the session. Refresh clears it by reloading both queries.

**Argument XML.** `customworkflowactivityinfo` is loaded with `XmlDocument` (GitHub `WorkflowActivitiesViewerControl.cs` 418-461). Every `Name` element under an `Inputs` element becomes an input name. Every `Name` element under an `Outputs` element becomes an output name. Required, type, description, and target are ignored. Any parse failure is swallowed and the corresponding list stays empty. Output names are rendered only when the input list count is greater than zero (GitHub line 496; decompiled line 505). An activity with outputs and no inputs hides the outputs. An activity with inputs and no outputs still shows an empty output section.

**Process detail.** `1.2019.9.6` shows the category text, process name, primary table, `createdon`, `modifiedon`, and start conditions (decompiled `WorkflowData.cs` 100-198). Start lines are on demand, record created, the comma-separated `triggeronupdateattributelist` with a space after each comma, and record deleted. If all four are empty it shows that there are no triggers. `1.2019.9.2` always shows the start heading and has no category and no empty-trigger line (GitHub `WorkflowActivitiesViewerControl.cs` 897-1003). `typename` and `version` are loaded and never shown.

**Paging, batching, retries.** Each query is one `RetrieveMultiple` with no `count`, no page, and no paging cookie. `MoreRecords` is ignored. FetchXML without a page size returns at most 5000 rows, so later activities or processes disappear with no error. `xaml` is a large memo, and `1.2019.9.6` downloads it for every activated definition with a primary table and a category, including business rules, actions, business process flows, and modern flows, before the user selects an activity. There is no retry and no throttling handling. Both queries run synchronously on the connection-update and refresh paths (GitHub `WorkflowActivitiesViewerControl.cs` 225-232 and 248-258).

**Privileges and connection.** One `IOrganizationService`. No privilege probe. Reading the rows requires read access to `plugintype`, `pluginassembly`, and `workflow`, including `workflow.xaml`. A fault from either query fails the whole refresh. The plugin forces TLS 1.2 on connection change (GitHub line 252). Settings store only `LastUsedOrganizationWebappUrl` (`Settings.cs` 17) and save it when the tool closes.

**Failure modes to keep visible.** Missing `name`, dates, bool triggers, `category`, `createdby`, or `modifiedby` throws while reading the row, so one bad row drops the rest of that query. `createdby.ToString()` on the detail panel throws when `EntityReference.Name` is null (decompiled `WorkflowActivitiesViewerControl.cs` 434-442). Global processes (`primaryentity` null), draft and suspended processes (`statecode` other than `1`), workflow activations (`type` other than `1`), and assemblies whose `sourcetype` is not Database never appear. `GetWorkflowDataByID` (decompiled lines 299-314) is unused.

**Keep.** The two read-only queries, the database-assembly filter, grouping by assembly name, the activated-definition filter from `1.2019.9.6` (category not null, not classic-workflow-only), the category integer map including its stale `6` label until option-set metadata replaces it, the case-insensitive `plugintype.name` substring against XAML, argument names from `Inputs`/`Outputs`/`Name`, and the start-condition fields.

**Leave behind.** WinForms layout, colors, icons, the misspelled dependency heading, the empty process click, the synchronous full-XAML preload, the silent 5000-row cap, the output-list bug, TLS and XrmToolBox settings, and any reverse "processes to activities" view the description mentions and the code does not implement.

### Power Tools mapping

This is a new activity-bar tool. It is not an extension of FetchXML Builder, FetchXML Tester, Data Migration, or Plugin Registration. FetchXML Tester can run either query, and that would return every `xaml` value to the renderer. Plugin Registration's catalog queries `plugintype` for steps and excludes `Compiled.Workflow%` types. Those queries do not carry this filter or this match rule.

- Tool id: `workflow-activities-viewer`
- Title: Workflow Activities Viewer
- Tooltip: See which activated processes reference a custom workflow activity
- `showInActivityBar`: true
- `allowMultipleInstances`: true
- One environment, through `useConnectionSelection` and `meta.connectionName`. No `meta.targetConnectionName`.
- Folder: `desktop/src/ui/tools/workflow-activities-viewer/` with `tool.ts`, `api/`, `model/`, `components/`, and `tests/`. Register once in `desktop/src/ui/tools/registry.tsx`.
- Sidecar folder: `api/PowerTools/PowerTools.API/Tools/WorkflowActivities/`. Map it from `Program.cs` with `DataverseContextFilter` and `DataverseClientFactory`.
- Status text through `useToolStatus`. Activity and process contracts stay private to the tool.
- Renderer calls `apiGet` only. No new Electron IPC.

New endpoints:

1. `GET /api/workflow-activities`
   - Request: no body. Optional `search` is a renderer concern and should not be required here.
   - Response: `{ assemblies: [{ assemblyId, name, activities: [{ pluginTypeId, name, typeName, version, createdOn, createdBy, modifiedOn, modifiedBy, inputs: [{ name }], outputs: [{ name }] }] }] }`
   - Dataverse: paged `QueryExpression` or FetchXML on `plugintype` with the published columns and filters (`isworkflowactivity` eq true, inner link `pluginassembly.sourcetype` eq 0). Follow `PagingCookie` until `MoreRecords` is false. Parse `customworkflowactivityinfo` in the sidecar. Group by `assemblyname`, sort assemblies by name. Return both argument lists even when one is empty. Do not return the raw XML.

2. `GET /api/workflow-activities/{pluginTypeId}/processes`
   - Response: `{ activityName, processes: [{ workflowId, name, category, categoryLabel, primaryEntity, createdOn, modifiedOn, onDemand, triggerOnCreate, triggerOnDelete, triggerOnUpdateAttributes: string[], subprocess, truncated }] }`
   - Dataverse: load that `plugintype` `name` with the same activity filter. Then page `workflow` with the published `1.2019.9.6` filters: `type` eq 1, `ownerid` not null, `rendererobjecttypecode` null, `category` not null, `statecode` eq 1, `primaryentity` not null. Apply the same predicate the plugin uses: case-insensitive substring of `xaml` against `plugintype.name`. Prefer a FetchXML `like` condition on `xaml` with `%` and `_` escaped, so the sidecar does not download every definition. If a server rejects `like` on `xaml`, page the filtered definitions in the sidecar, test the substring there, and drop `xaml` before the response. Map category with the published integers, and set `categoryLabel` from organization option-set labels when available so category `6` is not stuck on "Reserved". Split `triggeronupdateattributelist` on commas. `truncated` is true only if a server-side safety cap stops paging early. Unknown plugin type id returns 404. A fault returns the formatted Dataverse error and no partial silent success.

### Recommended implementation

1. Contracts and API. Add the two response types under `Tools/WorkflowActivities/`. Implement the activity query, paging loop, assembly grouping, and XML name extraction. Implement the process query so `xaml` never leaves the sidecar. Register `MapWorkflowActivitiesEndpoints()` in `Program.cs` next to the other tool maps. Cover filters, paging, a null `xaml`, a missing `createdby` name, argument XML with inputs only, outputs only, and malformed XML, category values `0` through `6` plus an unknown value, and `like` escaping. Use a fake organization service. Do not copy the plugin source into these tests.
2. Tool module. Add `desktop/src/ui/tools/workflow-activities-viewer/tool.ts` with the id, title, and tooltip above. Load assemblies for the selected connection, search by activity name in the client, and load processes when an activity is selected. Show assembly groups, argument names, process category, primary table, dates, and start conditions. Show an empty process list and a Dataverse error without failing the assembly list. Publish counts with `useToolStatus`.
3. Registry. Add the tool to `BUILT_IN_TOOLS` in `desktop/src/ui/tools/registry.tsx`.
4. Tests. Add renderer tests for search, collapsed versus expanded groups, a selected activity, an empty process list, and an error from the process request. Run the sidecar tests for the new project and the desktop tool tests. Do not call a live environment.

License and copy limits: GPL-3.0-or-later. Inspiration only. Do not copy source, WinForms layout, icons, or the plugin's labels. Do not vendor the NuGet package. Implementation of steps 1-4 waits on an explicit acceptance of that license impact.

Risks: substring matching false-positives and false-negatives; global actions omitted by `primaryentity` not null; non-database assemblies omitted; activated definitions only; `xaml` `like` may be expensive or unsupported on older on-premises servers, which is why the sidecar fallback exists; category `6` labeling must come from metadata rather than the plugin's "Reserved" string.

### UX

#### Sidebar

- Tool id `workflow-activities-viewer`. Show it in the activity bar (`showInActivityBar: true`).
- Title: **Workflow Activities Viewer**. Tooltip: **See which activated processes reference a custom workflow activity**. That tooltip is the activity-bar button `title` and accessible name. The entry is one row under the existing Search tools field.
- One tab (`allowMultipleInstances: false`). Choosing the tool again activates that tab. The tab follows the one selected environment and reloads when that environment changes.
- Icon: a new monochrome SVG. The activity bar already inverts sidebar icons. Do not reuse an XrmToolBox plugin icon.

#### Title bar

No title-bar menu item. Leave File, Edit, View, and Help unchanged. Refresh stays on the tool tab.

#### Tool tab

One surface, two columns, on `bg-[var(--color-bg-dark)]`. The left column is the assembly list. The right column is the selected activity. Each column is `bg-[var(--color-bg-darker)]`, split by `border-[var(--color-border-dark)]`. The environment control is the connection footer already on the activity bar.

1. **No environment.** Both columns show one message: select an environment from the connection control at the bottom of the tool sidebar. `SearchInput` and **Refresh** are disabled. Do not load activities or processes.
2. **Assemblies.** After an environment is selected, list custom workflow activities from database-stored plug-in assemblies, grouped by assembly name. Headers are in ascending name order. Each header is a tool-local button: the assembly name in `text-[var(--color-text-white)]`, the number of activities listed under it in `text-[var(--color-text-dark-gray)]`, and `hover:bg-[var(--color-hover-bg)]`. Activities under an expanded header are tool-local rows. These rows are not a new shared control.
   - `SearchInput` placeholder `Filter by activity name`. Match a case-insensitive substring of the activity name. Assembly names are not part of the match.
   - An empty filter starts with every assembly collapsed, and clearing the filter collapses every assembly again. With an empty filter, activating a header expands or collapses that assembly, and that choice stays until the filter changes or the environment changes.
   - Any other filter hides assemblies with no matching activity, lists only the matching activities, and expands those assemblies. Headers stay expanded for as long as the filter text is non-empty.
   - `Button` variant `secondary`, label Refresh. Disabled while a load is in flight. Refresh reloads activities and, when the same activity is still present, its processes. It keeps the filter text and any manual expansion. It keeps the selection when that activity is still in the list. Otherwise it clears the right column.
3. **Activity.** Until a row is selected, the right column reads **Select an activity.** in `text-[var(--color-text-dark-gray)]`. The selected row uses `bg-[var(--color-hover-bg)]` and `text-[var(--color-text-white)]`. The detail shows the activity name, created on, created by, modified on, and modified by. The name is `text-[var(--color-text-white)]`. Labels are `text-[var(--color-text-dark-gray)]`. Values are `text-[var(--color-text-gray)]`. A missing value reads **Unknown** in `text-[var(--color-text-dark-gray)]`.
4. **Arguments.** Under the dates, list input argument names and output argument names in two sections. Show both sections for every selected activity. A section with no names reads **No input arguments** or **No output arguments**.
5. **Processes.** For the selected activity, show the activated process definitions whose XAML contains that activity name. Use `DataTable` with columns Process, Category, Primary table, Created on, Modified on, and Start conditions. Leave Category blank when the process has no category text. Do not set `onRowClick`. Start conditions, in this order and only when they apply, are On demand, Record created, Columns changed plus the column names, and Record deleted, separated by a comma. When none of those apply, the cell reads **No start conditions**.

Changing the selected environment clears the filter, the manual expansion, and the selection, then loads activities for the new environment. The tab shows one environment.

#### States

- **Loading.** `Spinner` in the region that is loading. An activity load disables **Refresh** and publishes `Loading workflow activities…` with `useToolStatus`. A process load keeps the activity name, dates, and argument lists, replaces the process region with `Spinner`, and publishes `Loading processes…`.
- **Empty.** No environment: the message in step 1, and status `No environment selected`. No activities: **No custom workflow activities in database-stored assemblies.** A filter with no matches: **No activities match this filter.** No processes: `DataTable` `emptyMessage` is `No activated process references this activity.`
- **Success.** After activities load and no activity is selected, publish `N activities in M assemblies` with `useToolStatus`. `N` and `M` are the loaded totals. After processes load, publish `<activity name>: P activated processes`, or `<activity name>: no matching processes` when there are none. A successful load does not raise a toast.
- **Error.** `useToast` type `error` with the failure text. An activity-load failure clears the list and the detail, shows the text in the left column, and offers `Button` variant `secondary`, label Retry. A process-load failure leaves the assembly list and the activity detail in place, shows the text in the process region with **Retry**, and publishes `<activity name>: could not load processes`. An activity-load error publishes `Could not load workflow activities`. Toast already styles `error`. The palette has no separate error color.

#### Shared controls

- `Button` — Refresh and Retry.
- `DataTable` — processes for the selected activity.
- `SearchInput` — the activity-name filter.
- `Spinner` — activity and process loads.
- `Toast` and `useToast` — load errors.
- `useToolStatus` — the status strings above. The tool does not choose status ids.
- `Checkbox`, `Modal`, and `ProgressBar` are unused. Nothing is edited, confirmed, or measured as partial progress.

#### Colors

`bg-[var(--color-bg-dark)]` for the tab, `bg-[var(--color-bg-darker)]` for both columns, `text-[var(--color-text-white)]` for the activity name, assembly headers, and the selected row, `text-[var(--color-text-gray)]` for values, `text-[var(--color-text-dark-gray)]` for counts, empty copy, and Unknown, `border-[var(--color-border-dark)]` for the divider, and `hover:bg-[var(--color-hover-bg)]` plus the selected-row fill. No hex values.

#### What not to build

- A File, Edit, View, or Help command for this tool.
- Another tab of this tool, a second environment, or a compare between environments.
- Creating, updating, or deleting processes, assemblies, or activities.
- A process row that lists the activities that process runs, opens the process, or shows its XAML.
- A filter on assembly name, category, table, or process name.
- Argument type, required, description, or the raw argument XML.
- Version, type name, or any process column beyond Process, Category, Primary table, Created on, Modified on, and Start conditions.
- Activities from assemblies that are not database-stored, or processes that are not activated definitions.
- `Checkbox`, `Modal`, `ProgressBar`, a shared text field, or any new control in `desktop/src/ui/shared/ui`.
- A success toast for a completed load.
- A tree, property grid, dependency heading, XrmToolBox host chrome, plugin icon, or plugin wording.
- A connection picker inside the tab.

### Open questions

- License is GPL-3.0-or-later, recorded in ### Match. Accept that copyleft impact before implementation. This screen is specified from the capability list and does not copy the plugin source, WinForms layout, icons, or wording.
