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

### Dataverse review

Evidence is the current Microsoft Learn table references and query guidance, not the plugin binary. Process table: [workflow](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/workflow). Activity table: [plugintype](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/plugintype). Assembly table: [pluginassembly](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/pluginassembly). Where custom activities can be used: [workflow extensions](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/workflow/workflow-extensions). Global actions: [configure actions](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/configure-actions). Paging: [page FetchXML results](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/fetchxml/page-results) and [query data](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/org-service/entity-operations-query-data). Large-column and leading-wildcard filters: [query anti-patterns](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/query-antipatterns). Online throttling: [service protection API limits](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/api-limits). No live organization was queried.

#### Messages, metadata, paging, and batching

Both reads are `RetrieveMultiple` (`IOrganizationService.RetrieveMultiple`, or `RetrieveMultipleRequest`). The Web API equivalents are `GET /api/data/v9.2/plugintypes` and `GET /workflows`. `FetchExpression` and `QueryExpression` are the same message. There is no custom activity message to call. `WhoAmI`, impersonation, `ExecuteMultiple`, `ExecuteTransaction`, `SetState`, and publish are not part of this read. `RetrieveUnpublishedMultiple` is a different message. `workflow` supports it; the plugin does not call it.

`plugintype.isworkflowactivity` is a Boolean. FetchXML `eq` `1` and QueryExpression `true` are the same condition. The activity columns in the brief exist. `name` is optional (max 256). `typename` is required and is the fully qualified CLR type (max 256). `assemblyname` is "Full path name of the plug-in assembly" (max 100), not `pluginassembly.pluginassemblyid`. `customworkflowactivityinfo` is a memo (max 1,048,576) described only as serialized `SandboxCustomActivityInfo`, including required arguments. Microsoft does not publish that XML schema.

`pluginassembly.sourcetype` (`pluginassembly_sourcetype`) is Database `0`, Disk `1`, Normal `2`, AzureWebApp `3`, and File Store `4`. An inner link on `pluginassemblyid` with `sourcetype` eq `0` is a valid filter. It keeps database assemblies only.

`workflow` columns used by the plugin match the table. `type` (`workflow_type`) is Definition `1`, Activation `2`, Template `3`. `statecode` is Draft `0`, Activated `1`, Suspended `2`. Activated uses status reason `2`. The documented status reason for Suspended is `3`, labeled CompanyDLPViolation, in the current table reference. `category` (`workflow_category`) is Workflow `0`, Dialog `1`, Business Rule `2`, Action `3`, Business Process Flow `4`, Modern Flow `5`, Desktop Flow `6`, AI Flow `7`. Take `categoryLabel` from `FormattedValues` (Web API `OData.Community.Display.V1.FormattedValue`) for `workflow_category` in the caller’s language. Keep the integer when the formatted label is missing. `primaryentity` is an `EntityName`. `rendererobjecttypecode` is an `EntityName` described as "The renderer type of Workflow". `ondemand`, `triggeroncreate`, and `triggerondelete` are Booleans and default false. `triggeronupdateattributelist` is a memo of attribute logical names. `subprocess` means the definition can be included as a child process. The parent process is `parentworkflowid`, which the plugin does not read. `xaml` is a memo (max 1,073,741,823) and is marked ApplicationRequired. Modern flow logic is `clientdata`. Desktop flow script is `definition`. A null `xaml` is a real retrieve result for categories that do not store Windows Workflow XAML.

Custom workflow activities are used in the workflow, dialog, and action designers (categories `0`, `1`, and `3`). Dialogs are deprecated online; existing category `1` rows can remain. Global actions are category `3` with no table ("None (global)") and still store their definition in `xaml`. Business rules, business process flows, modern flows, desktop flows, and AI flows do not reference a custom workflow activity through `xaml`.

The stable activity id is `plugintypeid`. The stable process id is `workflowid`. `plugintypeidunique` and `workflowidunique` identify a solution layer. Group assemblies by `pluginassemblyid`. `assemblyname` can collapse two assemblies onto one string. `plugintype.name` is the designer menu name. The Plug-in Registration tutorial edits that menu name independently of the CLR type. Match the class identity from `typename` (the type name before any assembly-qualified comma). The plugin’s case-insensitive substring of `name` against `xaml` is a different test. A short menu name false-matches, and a renamed menu name misses XAML that still contains the CLR type. The exact token written into `xaml` was not read from a live process.

Page with `PagingCookie` until `MoreRecords` is false. Pass the cookie back unchanged. These tables are standard tables, so the default and maximum page size is 5,000, not the elastic 500. FetchXML with no `count` still stops at that page and sets `MoreRecords` when more rows exist. Order by `plugintypeid` or `workflowid` as the tie-break. Ordering only by `assemblyname` or `name` can repeat or skip rows across pages. Do not ask for 5,000 rows when the column set includes `xaml` or `customworkflowactivityinfo`. The platform does not publish a smaller maximum; a page of `xaml` values times out or returns a very large response.

Do not filter on `xaml`. It is a large text column, and a contains test is a leading `%` wildcard. That is `PerformanceLargeColumnSearch` plus `PerformanceLeadingWildCard`. Documented faults include `LeadingWildcardCauseTimeout` (`0x80048573`, `-2147187341`), `DataEngineLeadingWildcardQueryThrottling` (`0x80048644`, `-2147187132`), and `PerformanceValidationIssuesCauseTimeout` (`0x80048575`, `-2147187339`). The process query should page category `0`, `1`, and `3` only, read `xaml` in the sidecar, test the substring there, and drop `xaml` before the response. The recommended FetchXML `like` on `xaml` is the query to avoid, including on older on-premises servers. FetchXML documents `%`, `_`, and `[` as wildcards. An escape clause for those characters was not found, so "escape `%` and `_`" is not a confirmed FetchXML contract.

`ownerid` is SystemRequired on this user-owned table. `ownerid` not null does not remove rows. `componentstate` eq `0` (Published) should be on both queries. Values are Published `0`, Unpublished `1`, Deleted `2`, Deleted Unpublished `3`. The plugin never filters it.

`triggeronupdateattributelist` splits on commas. Logical names do not contain commas. Empty means no column-change trigger. There is no separate `triggeronupdate` Boolean. An action often has all four start flags empty because it runs when it is invoked. Empty start conditions do not mean the process never runs.

#### Privileges and connection requirements

Use the existing caller’s `IOrganizationService`. Do not call `WhoAmI` and do not set `CallerId`. Impersonation would change which processes are visible.

`plugintype` and `pluginassembly` are organization-owned. The caller needs Read on both (`prvReadPluginType`, `prvReadPluginAssembly`). Depth is organization. The inner link fails the whole activity query when either privilege is missing. `workflow` is user-owned. The caller needs Read (`prvReadWorkflow`) at the granted depth: user, business unit, parent-child, or organization. `RetrieveMultiple` returns only rows the caller can read. User-level Read is not an inventory of every activated process. `xaml` has no separate privilege in the table reference. Shared processes are included when share gives the caller access.

`createdby` and `modifiedby` are lookups to `systemuser` and are optional. `EntityReference.Name` is empty when the name was not returned. The id can still be present. A missing name is an empty display value, not a failed page.

#### Online versus on-premises

The message is `RetrieveMultiple` on both. Online Plug-in Registration stores assemblies in the database and sandbox. Disk (`1`) and Normal (`2`) are the on-premises disk and GAC locations, and on-premises custom workflow activities can run from those locations in partial or full trust. Isolation mode None `1` is the on-premises full-trust value. Sandbox is `2`. External is `3`. The database-only link hides on-premises activities that the process designer can still run. AzureWebApp `3` and File Store `4` are in the current option set. Whether those source types can have `isworkflowactivity` true was not verified.

Current Dataverse metadata includes categories `5`, `6`, and `7` and source types `3` and `4`. Older on-premises option sets can omit those values. An unknown integer should be returned as that integer with an empty label. Dialogs are deprecated online and can still be category `1` rows. Online service protection, per web server, is 6,000 requests, 1,200 seconds of execution, or 52 concurrent requests in a five-minute window: `-2147015902` (`0x80072322`), `-2147015903` (`0x80072321`), and `-2147015898` (`0x80072326`). The SDK returns `Retry-After` on `OrganizationServiceFault.ErrorDetails`. Those limits are the online contract. The plugin’s TLS 1.2 switch is a client setting. The existing connection already authenticates. Online requires TLS 1.2. On-premises auth stays with that connection (Active Directory, IFD, or OAuth).

#### Solution and managed limits

This tool only reads. Managed and unmanaged rows both come back from `RetrieveMultiple`. `ismanaged` is read-only on `plugintype` and `workflow`. Managed `xaml` and `customworkflowactivityinfo` are readable. No column in a managed layer has to be edited. Do not send `Update`, `SetState`, or a publish message, and do not pass a solution unique name. Filter `componentstate` eq `0` so a published row and another layer are not listed as two activities or two processes. Unpublished process edits are draft rows and are the `RetrieveUnpublishedMultiple` path, which this tool does not need for activated definitions.

#### Failure modes

One `RetrieveMultiple` either returns a page or faults. It does not commit a partial page. A privilege failure fails the whole query. A fault on a later page must be returned as the Dataverse error. A short page is complete only when `MoreRecords` is false. `truncated` means an intentional safety cap stopped paging early, and that cap has to be visible.

A null or missing `xaml` does not match. Do not throw. A missing `plugintype.name`, `createdby`, `modifiedby`, date, Boolean, or `category` is an empty field. Do not drop the rest of the page. Boolean attributes that are absent are false. Malformed or empty `customworkflowactivityinfo` yields empty argument lists and still returns the activity. Return input names and output names independently.

`like` on `xaml` fails with the leading-wildcard and large-column faults above, or with query throttling, before it returns a dependency list. Scanning every category’s `xaml` at page size 5,000 can time out even after the category list is corrected. Online service-protection faults include `Retry-After`. Surface those faults. Do not turn them into an empty process list.

Copied plugin filters miss global actions when `primaryentity` is null, miss on-premises disk and GAC assemblies, miss draft and suspended processes, and miss a process whose XAML contains `typename` but not the menu `name`. They also download `xaml` for categories that cannot contain the activity. Duplicate `workflowid` or `plugintypeid` rows can appear when `componentstate` is unfiltered. That duplicate-layer result was not executed against a live organization.

#### Plugin claims that are wrong

- Category `6` is not "Reserved". Current `workflow_category` labels it Desktop Flow. Category `7` is AI Flow. The plugin map has no arm for `7`, so that label is empty. [workflow category](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/workflow), [desktop flows](https://learn.microsoft.com/en-us/power-automate/developer/desktop-flow-public-apis), [manage flows with code](https://learn.microsoft.com/en-us/power-automate/manage-flows-with-code).
- `pluginassembly_sourcetype` is not only Database, Disk, and Normal. Current values include AzureWebApp `3` and File Store `4`. [pluginassembly](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/pluginassembly).
- `plugintype.name` is not the process identity inside XAML. `typename` is the required CLR type. `name` is the optional menu name and can be edited after registration. [plugintype](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/plugintype), [tutorial](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/workflow/tutorial-create-workflow-extension).
- `category` not null is not the set of processes that can run a custom activity. The documented hosts are workflow, dialog, and action. [workflow extensions](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/workflow/workflow-extensions).
- `primaryentity` not null drops global actions. Global actions are valid action processes with no table, and their definition is `xaml`. [configure actions](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/configure-actions).
- `ownerid` not null does not filter this user-owned table. `ownerid` is SystemRequired.
- `subprocess` is "can be a child process", not a link to a parent. The parent column is `parentworkflowid`.
- A FetchXML `like` on `xaml` is a leading-wildcard filter on a large text column, not a safe way to avoid downloading definitions. [query anti-patterns](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/query-antipatterns).
- Ignoring `MoreRecords` is a plugin defect. The platform reports further rows with `MoreRecords` and a paging cookie. The 5,000-row page is the standard-table maximum, not a silent end of data. [page results](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/fetchxml/page-results).
- A null `createdby` name, a null `plugintype.name`, or a null `xaml` does not fail `RetrieveMultiple`. The plugin throw is local code. `RetrieveMultiple` itself has no per-row partial success.

#### Plugin claims that remain unverified

- The `Inputs` / `Outputs` / `Name` element shape. The column is serialized `SandboxCustomActivityInfo`. No public schema was found, and no live value was retrieved. An `InOutArgument` may be stored once, under both lists, or under an element this parser does not read.
- The exact substring a process designer writes into `xaml` for a custom activity.
- Whether a global action stores `primaryentity` as null or as an empty string. The table reference marks the column SystemRequired. The maker documentation allows None (global). Those statements were not compared on a live row.
- Which processes set `rendererobjecttypecode`. The null filter is the plugin’s choice.
- Whether `RetrieveMultiple` returns every `componentstate` layer or only the active row. Both tables have the column, and `workflow` has a separate unpublished message. A live organization was not queried.
- Whether source types `3` and `4` can have `isworkflowactivity` true.
- Whether `pluginassembly.name` is unique in an organization. Grouping by `plugintype.assemblyname` can still merge distinct `pluginassemblyid` values.
- A FetchXML escape syntax for `%`, `_`, and `[`.
- The `triggeronupdateattributelist` value used when the designer selects every column.
- On-premises option-set members for category `5`–`7` and source type `3`–`4` on servers older than the current Dataverse metadata.
- That `xaml` is not column-secured in a given organization. The table reference shows it as readable with the row. Column security, if an administrator adds it, omits the value instead of failing the page.

### UX

#### Sidebar

- Tool id `workflow-activities-viewer`. Show it in the activity bar (`showInActivityBar: true`).
- Title: **Workflow Activities Viewer**. Tooltip: **See which activated processes reference a custom workflow activity**. That tooltip is the activity-bar button `title` and accessible name. The entry is one row under the existing Search tools field.
- One tab (`allowMultipleInstances: false`). Choosing the tool again activates that tab. The tab follows the one selected environment and reloads when that environment changes.
- Icon: a new monochrome SVG. The activity bar already inverts sidebar icons. Do not reuse an XrmToolBox plugin icon.

#### Title bar

No title-bar menu item. Leave File, Edit, View, and Help unchanged. Refresh stays on the tool tab.

#### Tool tab

One surface, two columns, on `bg-[var(--color-bg-dark)]`. The left column is the assembly list. The right column is the selected activity. Each column is `bg-[var(--color-bg-darker)]`. The columns are a horizontal split with a draggable divider: `Group`, `Panel`, and `Separator` from `react-resizable-panels`. The separator is `w-1 cursor-col-resize bg-[var(--color-bg-light)]`, with `hover:bg-[var(--color-primary)]` and `active:bg-[var(--color-primary)]`, and its accessible name is `Resize panes`. Each pane keeps a minimum size so it cannot be dragged away. The environment control is the connection footer already on the activity bar.

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

`bg-[var(--color-bg-dark)]` for the tab, `bg-[var(--color-bg-darker)]` for both columns, `text-[var(--color-text-white)]` for the activity name, assembly headers, and the selected row, `text-[var(--color-text-gray)]` for values, `text-[var(--color-text-dark-gray)]` for counts, empty copy, and Unknown, `bg-[var(--color-bg-light)]` for the draggable divider, `hover:bg-[var(--color-primary)]` while dragging or hovering it, and `hover:bg-[var(--color-hover-bg)]` plus the selected-row fill. No hex values.

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

### Implementation notes and test evidence

- Files added:
  - `desktop/src/ui/tools/workflow-activities-viewer/` (`tool.ts`, `WorkflowActivitiesViewer.tsx`, `workflow-activities-icon.svg`, `api/`, `model/`, `tests/`)
  - One registration in `desktop/src/ui/tools/registry.tsx`
  - Sidecar `api/PowerTools/PowerTools.API/Tools/WorkflowActivities/`, mapped from `Program.cs` with `DataverseContextFilter` and `DataverseClientFactory`
  - `api/PowerTools/PowerTools.API.WorkflowActivities.Tests/` and its solution entry
- Endpoints: `GET /api/workflow-activities` and `GET /api/workflow-activities/{pluginTypeId}/processes`. The renderer calls `apiGet` with `meta.connectionName` only. The tab follows the activity-bar environment and reloads when that connection changes.
- Behavior taken from the Dataverse review and UX, where those sections override the earlier mapping: `RetrieveMultiple` only; database assemblies (`sourcetype` 0) and published custom workflow activities (`isworkflowactivity` true, `componentstate` 0); activity pages of 250 ordered by `assemblyname` then `plugintypeid`; groups by `pluginassemblyid`, sorted by assembly name; argument names parsed in the sidecar, with inputs and outputs returned independently and malformed XML kept as empty lists; missing names, dates, and lookup names stay empty and the screen shows Unknown. Processes are activated definitions (`type` 1, `statecode` 1, `componentstate` 0, `rendererobjecttypecode` null) in categories 0, 1, and 3, including global actions. `xaml` is read in the sidecar at page size 50, matched case-insensitively to the CLR type identity from `typename`, and dropped before the response. `categoryLabel` comes from formatted values. An intentional cap of 200 process pages sets `truncated`, and the screen says the process list stopped early. Unknown activity ids return 404. Dataverse faults, including service-protection faults with `Retry-After`, are returned as errors rather than empty lists. The screen is one tab (`allowMultipleInstances: false`) with the UX states, columns, start-condition order, and shared controls named in ### UX. No plugin source, WinForms UI, icons, or unique copy was copied.
- Commands and results:
  - `dotnet test api/PowerTools/PowerTools.API.WorkflowActivities.Tests/PowerTools.API.WorkflowActivities.Tests.csproj` — passed, 16 tests. `UseAppHost=false` was not required.
  - From `desktop/`: `npm test` — passed, 56 files, 274 tests.
  - From `desktop/`: `npm run lint` — passed.
  - From `desktop/`: `npm run build` — passed.
  - From `desktop/`: `npm run check` — passed (typecheck, lint with `--max-warnings 0`, tests, renderer build, and the smoke launch).
- The two columns use a draggable `react-resizable-panels` separator named `Resize panes`. A fixed half width is not the divider.

### Open questions

- License is GPL-3.0-or-later, recorded in ### Match. Accept that copyleft impact before implementation. This screen is specified from the capability list and does not copy the plugin source, WinForms layout, icons, or wording.
- Accept the GPL-3.0-or-later license impact before any implementation copies or vendors plugin code. A clean-room reimplementation from this brief, with no copied source, is the path the researcher described. This work is still inspired by a GPL plugin, so that inspiration has to be accepted before implementation.
- Resolved: the add-tool request accepts a clean-room implementation and no plugin source was copied.
