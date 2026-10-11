### Match

- **Plugin:** Solution Layers Explorer, by MscrmTools (Tanguy Touzard).
  - NuGet id `MscrmTools.SolutionLayersExplorer`, latest version 1.2024.5.22 (May 2024), about 87K downloads. Catalog URL by convention is https://www.xrmtoolbox.com/plugins/MscrmTools.SolutionLayersExplorer/. That host did not resolve from this sandbox, so the metadata comes from https://www.nuget.org/packages/MscrmTools.SolutionLayersExplorer.
  - Description: "explore and delete unmanaged layers of your Dataverse solutions". Tags: XrmToolBox, Tool, Solution, Layer.
- **Source:** https://github.com/MscrmTools/MscrmTools.SolutionLayersExplorer. **License: GPL-3.0**, so we treat it as inspiration only (see the blocker above).
- **Related plugins considered:**
  - `XrmSolutionsUK.XrmToolBoxPlugins.ManagedSolutionLayerRaiser` reorders managed layers. That is a different job, so it is out of scope.
  - A NuGet profile (maciejkornacki) lists a bulk "remove active layers" plugin. It overlaps only with the removal step and adds no new backend knowledge, so I did not read it.
- **Confidence: high.** The source confirms every Dataverse element the request expected:
  - the `msdyn_componentlayer` table
  - the `msdyn_componentid` + `msdyn_solutioncomponentname` filter
  - the `msdyn_order`, `msdyn_changes`, `msdyn_componentjson` and `msdyn_children` columns
  - the `RemoveActiveCustomizations` message
- **Existing Power Tools coverage: none.**
  - The registered tools are attribute-explorer, bulk-workflow-execution, data-migration, fetchxml-builder, fetchxml-tester, plugin-registration, polymorphic-lookup-creator, solution-components-mover, translator, workflow-activities-viewer and welcome.
  - A grep for `componentlayer` or "solution layer" in `desktop/src` and `api` finds nothing.
  - Solution Components Mover is the nearest tool. It copies components between solutions and does not read layers, so a new tool fits better than extending it. Its `/solutions` and `/component-types` queries are useful patterns to copy.

### What it does

- Lists the solution layers of a component: the system/base layer, each managed solution layer, and the top "Active" (unmanaged) layer. Each layer shows its order, solution name, publisher, version and overwrite time.
- Shows, for the selected layer:
  - **Changes:** what this layer altered (`msdyn_changes`).
  - **All properties:** the full component state in this layer (`msdyn_componentjson`).
  - **Children:** child components (`msdyn_children`).
- Compares any two layers of the same component:
  - property by property, with a flag on each property that differs and an optional "only differences" filter;
  - a text diff of a chosen property's value, pretty-printed when it is JSON;
  - web resource `content` decoded from base64 before diffing.
- Removes the Active (unmanaged) layer of a component, singly or in bulk, after a confirmation.
- Plugin extras we can leave out for v1:
  - browsing a whole solution to find components that have an Active layer;
  - Excel export;
  - per-type links into other XrmToolBox tools.

### Backend findings

All citations are relative to `MscrmTools.SolutionLayersExplorer/` in the upstream repo.

**1. Reading the layers of one component** (`AppCode/ActiveLayerSearch.cs:46-60`, `ExportToExcel.cs:80-95`)
- Query: `RetrieveMultiple` on `QueryExpression("msdyn_componentlayer")` with `NoLock = true` and an AND of two conditions:
  - `msdyn_solutioncomponentname Equal <component type NAME string>`
  - `msdyn_componentid Equal <objectid Guid>`
- `msdyn_componentlayer` is a virtual (elastic/virtual) table. It must be filtered by both conditions, and the plugin never pages or orders it server-side.
- Columns used:
  - `msdyn_componentlayerid`, `msdyn_componentid`, `msdyn_solutioncomponentname`
  - `msdyn_solutionname`, `msdyn_solutionversion`, `msdyn_publishername`
  - `msdyn_overwritetime`, `msdyn_order`, `msdyn_name`
  - `msdyn_changes`, `msdyn_componentjson`, `msdyn_children`
  - Field names are listed in `ExportToExcel.cs:108-116` and `MyPluginControl.cs:578-580`.
- **The Active layer** is the row where `msdyn_solutionname == "Active"` (`AppCode/LayerItem.cs:13`). If that row is missing, the component has no unmanaged customizations.
- **"Has unmanaged changes"** means more than one layer AND an Active layer exists (`UserControls/ComponentsPicker.cs:50`). A component with only an Active layer is purely unmanaged, so "removing" its layer makes no sense. Keep this rule.

**2. Mapping a component type to `msdyn_solutioncomponentname`**
- **This is the main gotcha.** The filter value is the component type's enum NAME, not its number (`AppCode/ActiveLayerSearch.cs:43`). The plugin keeps a hand-maintained enum in `AppCode/Enums.cs` (about 90 entries). Key mappings:

| Component type | Number | Filter value |
| --- | --- | --- |
| Entity | 1 | `Entity` |
| Attribute | 2 | `Attribute` |
| OptionSet | 9 | `OptionSet` |
| EntityRelationship | 10 | `EntityRelationship` |
| Role | 20 | `Role` |
| Form (legacy) | 24 | `Form` |
| SavedQuery (view) | 26 | `SavedQuery` |
| Workflow (classic workflows, flows, actions, BPFs) | 29 | `Workflow` |
| SavedQueryVisualization | 59 | `SavedQueryVisualization` |
| SystemForm | 60 | `SystemForm` |
| WebResource | 61 | `WebResource` |
| AppModule | 80 | `AppModule` |
| PluginAssembly | 91 | `PluginAssembly` |
| SdkMessageProcessingStep | 92 | `SdkMessageProcessingStep` |
| CanvasApp | 300 | `CanvasApp` |

- Special case: component type 418 (dataflow) must use `msdyn_dataflow` (`AppCode/ActiveLayerSearch.cs:44`).
- For newer, solution-aware table-based components, the name string is usually the table logical name.
- Recommendation: write our own small mapping dictionary for the supported types, and fall back to `solutioncomponentdefinition.name` (queried in `MyPluginControl.cs:519-531`) for anything else.
- Licensing note: these type names are Dataverse platform facts, not plugin expression, so writing our own dictionary is fine.

**3. Layer ordering**
- `msdyn_order` is the stack position. The plugin labels layers `"{msdyn_order} - {msdyn_solutionname}"` (`UserControls/CustomReasons/GenericLayersComparerControl.cs:324`).
- It relies on the order the server returns (`FillLayers`, line ~232) and never sorts. **We should sort explicitly** by `msdyn_order` descending so Active sits on top. Do the sort in the sidecar, in memory.

**4. Comparing layers** (`GenericLayersComparerControl.cs:136-300`)
- `msdyn_componentjson` is shaped like `{ "Attributes": [ { "Key": "...", "Value": ... } ] }`. The compare logic:
  - parse both layers' JSON;
  - pair attributes by `Key`;
  - `JToken.DeepEquals` on `Value` to flag differences;
  - for the chosen property, pretty-print the JSON when it parses, then line-diff the two values.
- Web resource `content` is base64. Decode it to UTF-8 and strip the BOM before diffing (lines 168-172, 241-252).
- Upstream bugs to avoid:
  - The fallback lookup on lines 159-162 reads from the wrong array.
  - It always preselects index 1 for the second layer, which breaks when there is only one layer.
- All of this is pure, client-side logic on data we already fetched. It needs no Dataverse call.
- Related lookups (`MyPluginControl.cs:285`): `msdyn_componentjson` also carries useful lookup keys, such as `entityid` (the parent table's MetadataId) on Attribute layers.

**5. Removing the Active layer** (`MyPluginControl.cs:688-692`)
- Unbound message `OrganizationRequest("RemoveActiveCustomizations")` with:
  - `SolutionComponentName` = the Active layer's `msdyn_solutioncomponentname`
  - `ComponentId` = the Active layer's `msdyn_componentid`
- The plugin sends one request per component, sequentially, and supports cancelling between requests.
- Failure modes:
  - The message faults when the component has no managed layer underneath.
  - It faults when the caller lacks the System Customizer / System Administrator privilege.
  - The plugin shows no per-item error handling; one failure aborts the whole loop.
- After removal the plugin only updates its UI. **We should re-query the layers** to confirm the result.
- Removal is destructive: it permanently discards unmanaged customizations. It does not publish, so a publish may still be needed for some types (forms, views, sitemaps). Flag this in the UI. That publish requirement is my inference and is unverified.

**6. Batching (used only by the plugin's solution-wide mode)**
- `ExecuteMultipleRequest` holding `RetrieveMultipleRequest`s, with `ContinueOnError = true` and `ReturnResponses = true`.
- Batch size is 200 in `ActiveLayerSearch.cs:66` and 500 in `ExportToExcel.cs:144`.
- Bug: the plugin never checks `response.Fault`, so it hits a null reference on faulted items.
- A single-component tool does not need any of this.

**7. Finding components (the plugin's solution-browsing mode, useful context)**
- `solutioncomponent` filtered by `solutionid` (`UserControls/ComponentsPicker.cs:77-87`). The plugin does not page this query, which is a bug above 5000 rows.
- Entities with `rootcomponentbehavior == 0` expand into attributes and relationships through `RetrieveMetadataChangesRequest` (lines 148-215, `IsManaged == true` filter). They also expand into `systemform`, `savedquery` and `savedqueryvisualization` by table.
- Plugin step images (93) are pulled through `sdkmessageprocessingstepimage`.
- Solutions come from `solution` filtered by `ismanaged` / `isvisible` (`UserControls/SolutionPicker.cs:45-61`).

**8. Privileges and connections**
- Read: needs read access to the `msdyn_componentlayer` virtual table, normally System Customizer or above.
- Remove: needs customizer or admin rights.
- The tool uses one connection, never a target.

**Keep:**
- the two-condition layer query
- the name-string type mapping, including the 418 dataflow exception
- `msdyn_solutionname == "Active"` as the Active flag
- the ">1 layer and an Active layer" removal guard
- key-wise comparison of `msdyn_componentjson`
- base64 decoding of web resource content
- the `RemoveActiveCustomizations` parameters

**Leave behind:**
- the WinForms UI and its ScintillaNET / diff-control dependencies
- Excel export
- XrmToolBox cross-tool links
- unpaged queries
- unchecked ExecuteMultiple faults
- the fragile second-layer preselection

### Power Tools mapping

**Reuse**
- `useTabConnection` with `meta.connectionName`, `useToolStatus`, and `apiGet` / `apiPost` from `desktop/src/ui/shared/api/client.ts`.
- Shared UI: `DataTable`, `Tabs`, `CodeEditor` / `CodeMirrorEditor` (read-only JSON panes), `Modal` (remove confirmation), `Alert`, `Badge`, `SearchInput`, `Spinner`, `EmptyState`, `Toolbar`.
- `GET /api/metadata/entities` for picking a table. It does not return `MetadataId`, so it is not enough on its own to get a table's or attribute's component id. See the `/components` endpoint below.
- Patterns from `Tools/SolutionComponentsMover/SolutionComponentsMoverQueries.cs`: the `solution` and `solutioncomponentdefinition` queries, and the result/problem-to-HTTP helper style.

**Line diff**
- `@codemirror/merge` is not installed. Either add it (MIT, same CodeMirror family), or render a two-column property diff in a table with a small MIT line-diff library such as `diff`. I recommend `@codemirror/merge` because `CodeMirrorEditor` already exists. Treat it as a new dependency to confirm.

**New sidecar group**
- Location: `api/PowerTools/PowerTools.API/Tools/SolutionLayers/`
- Files: `SolutionLayersEndpoints.cs`, `SolutionLayersService.cs`, `SolutionLayersQueries.cs`, `SolutionLayersDtos.cs`, `ComponentLayerNames.cs` (our own type-number to name map)
- Wiring: `MapGroup("/api/solution-layers").AddEndpointFilter<DataverseContextFilter>()`, registered in `Program.cs` as `app.MapSolutionLayersEndpoints();`

**Endpoint 1: list component types**
- `GET /api/solution-layers/component-types`
- Returns `{ componentTypes: [{ componentType: number, name: string, layerName: string, supported: boolean }] }`.
- Behind it: the static map, merged with `solutioncomponentdefinition` (`name`, `solutioncomponenttype`).

**Endpoint 2: find components**
- `GET /api/solution-layers/components?componentType=60&search=account&entity=account`
- Returns `{ components: [{ componentId, componentType, name, parentEntity? }] }`, limited to the first 50 matches.
- Per-type Dataverse call:

| Type | Table / request | Filter or column read |
| --- | --- | --- |
| Entity | `RetrieveMetadataChangesRequest` / `RetrieveAllEntitiesRequest(EntityFilters.Entity)` | `MetadataId`, `LogicalName`, `DisplayName` |
| Attribute | `RetrieveEntityRequest(EntityFilters.Attributes)` | each attribute's `MetadataId` |
| SystemForm | `systemform` | `name like`, optional `objecttypecode` |
| SavedQuery | `savedquery` | `returnedtypecode` |
| SavedQueryVisualization | `savedqueryvisualization` | (by name) |
| WebResource | `webresource` | `name` / `displayname like` |
| Workflow | `workflow` | `name like` |
| Role | `role` | parentroleid null |
| OptionSet | `RetrieveAllOptionSetsRequest` | (global option sets) |
| AppModule | `appmodule` | (by name) |
| PluginAssembly | `pluginassembly` | (by name) |
| SdkMessageProcessingStep | `sdkmessageprocessingstep` | (by name) |

- Use `TopCount` or paging so the result stays bounded.

**Endpoint 3: get layers**
- `GET /api/solution-layers/layers?componentType=60&componentId=<guid>`
- Behind it: resolve the layer name, then `RetrieveMultiple(msdyn_componentlayer)` with the two conditions and all columns. Sort by `msdyn_order` descending in memory.
- Returns `{ layerName, hasActiveLayer, canRemoveActive, layers: [{ id, order, solutionName, solutionVersion, publisherName, overwriteTime, name, isActive, changes, componentJson, children }] }`.
  - The three JSON strings are returned raw. The client parses them defensively.
  - `canRemoveActive` = `layers.length > 1 && hasActiveLayer`.

**Endpoint 4: remove the Active layer**
- `POST /api/solution-layers/remove-active`
- Body: `{ componentType, componentId }`.
- Behind it:
  1. Re-query the layers on the server and refuse with 409 when `canRemoveActive` is false.
  2. Execute `OrganizationRequest("RemoveActiveCustomizations") { SolutionComponentName, ComponentId }`.
  3. Return the refreshed layers response.
- Map `FaultException<OrganizationServiceFault>` to a `{ code, message }` problem: 403 for privilege errors, 422 otherwise.
- Synchronous: one component, so no job store is needed.

**New desktop tool**
- id `solution-layers-explorer`
- title "Solution Layers Explorer"
- tooltip / catalog description: "Inspect the solution layers of a single component, compare any two layers, and remove its unmanaged Active layer."
- Folder `desktop/src/ui/tools/solution-layers-explorer/`:
  - `tool.ts` (`defineTool`) and `SolutionLayersExplorer.tsx`
  - `api/`: `queryKeys.ts`, `solutionLayersApi.ts` (react-query hooks using `meta.connectionName`)
  - `model/`:
    - `types.ts`
    - `componentJson.ts`: parse `{Attributes:[{Key,Value}]}`, key-wise diff, pretty-print, base64 decode for `WebResource.content`
    - `apiError.ts`
  - `components/`: `ComponentPicker.tsx` (type select + search), `LayerList.tsx`, `LayerDetails.tsx` (Changes / All properties / Children tabs), `LayerCompare.tsx` (two layer selects, a property list with a diff marker and an "only differences" toggle, a value diff), `RemoveActiveDialog.tsx`
  - `tests/node/componentJson.test.ts`, `tests/renderer/solutionLayersExplorer.test.tsx`, `tests/fixtures.ts`
- This is a new activity-bar tool, not an extension of FetchXML Builder or Data Migration. Register it in `registry.tsx` (`ACTIVITY_BAR_TOOLS`) and add it to `publicCatalog.ts` in the same order. All contracts stay tool-local; nothing goes in `shared/contracts`.

### Recommended implementation

1. **Sidecar mapping and queries.**
   - Add `ComponentLayerNames.cs`: our own map for the supported types (1, 2, 9, 10, 20, 26, 29, 59, 60, 61, 80, 91, 92, 300), plus the 418 to `msdyn_dataflow` exception and a fallback to `solutioncomponentdefinition.name`.
   - Add `SolutionLayersQueries.ComponentLayers(name, id)`.
   - Unit-test the mapping and the query shape.
2. **Layers endpoint.**
   - Add `SolutionLayersService.GetLayersAsync` behind a small client interface, following the `DataverseSolutionComponentsMoverClient` pattern so it is testable without Dataverse.
   - Sort by `msdyn_order` descending and compute `hasActiveLayer` / `canRemoveActive`.
   - Map the endpoint and register it in `Program.cs`.
   - Tests: no layers, Active only (not removable), managed + Active (removable), malformed JSON passed through untouched.
3. **Remove endpoint.**
   - Server-side guard, then `RemoveActiveCustomizations`, then fault-to-problem mapping, then re-query.
   - Tests: guard returns 409, a fault returns a problem, success returns refreshed layers.
4. **Components and component-types endpoints.** Start with Entity, Attribute, SystemForm, SavedQuery and WebResource, then add Workflow and the remaining types in a follow-up. Bound every query.
5. **Desktop model.** Write `componentJson.ts` (parsing, key-wise diff, base64 web resource decode) as pure functions with node tests. Write it from scratch, not ported.
6. **Desktop API hooks.** Add `queryKeys.ts` and `solutionLayersApi.ts` with the connection meta. The remove mutation invalidates the layers query.
7. **UI.**
   - Picker, then the layer list (Active highlighted with a `Badge`), then the details tabs (read-only JSON editors), then compare, then the remove dialog.
   - The remove dialog names the component, warns that the change is permanent and may need a publish, and is disabled unless `canRemoveActive`.
   - Use `useToolStatus` for "N layers · Active layer present".
   - Line diff: add `@codemirror/merge` once the dependency is approved, or render a property table as the fallback.
8. **Register.** Add `tool.ts` and an icon, the `registry.tsx` entry and the `publicCatalog.ts` entry. Add renderer tests with fixtures (list, compare, remove flow, error display).

**Risks**
- `msdyn_componentlayer` can be slow, and it returns large JSON for big forms and web resources. Fetch it on demand for a single component and do not prefetch.
- Some component types have no layer rows or use different names. Show an empty state rather than an error.
- `RemoveActiveCustomizations` is destructive and needs elevated privileges. The confirmation and server-side guard are required.
- `msdyn_solutioncomponentname` values for newer component types are not documented in one place. Use the fallback and check against a live org.

**What not to copy (GPL-3.0)**
- Any C# from the repo, including the `Enums.cs` list verbatim (rebuild the mapping from Microsoft docs or `solutioncomponentdefinition`).
- The WinForms layouts, icons, wording, and the Excel exporter.

Sources:
- https://www.nuget.org/packages/MscrmTools.SolutionLayersExplorer
- https://github.com/MscrmTools/MscrmTools.SolutionLayersExplorer (read locally from a scratch clone at `/tmp/claude-0/-home-user-PowerTools/be77b69c-d7be-55a4-baaf-1f99df485cd3/scratchpad/sle/src`)
- https://www-1.nuget.org/packages/XrmSolutionsUK.XrmToolBoxPlugins.ManagedSolutionLayerRaiser

Power Tools files to read before building:
- `/home/user/PowerTools/desktop/src/ui/tools/registry.tsx`
- `/home/user/PowerTools/desktop/src/ui/tools/publicCatalog.ts`
- `/home/user/PowerTools/desktop/src/ui/tools/solution-components-mover/`
- `/home/user/PowerTools/api/PowerTools/PowerTools.API/Tools/SolutionComponentsMover/SolutionComponentsMoverEndpoints.cs`
- `/home/user/PowerTools/api/PowerTools/PowerTools.API/Tools/SolutionComponentsMover/SolutionComponentsMoverQueries.cs`
- `/home/user/PowerTools/api/PowerTools/PowerTools.API/Program.cs`
- `/home/user/PowerTools/desktop/src/ui/shared/contracts/dataverse.ts`

### Dataverse review

**Evidence used.** Microsoft's generated table reference for `msdyn_componentlayer` and `solutioncomponent`, the Dataverse web service error code list, the maker article "Solution layers" (section "Remove an unmanaged layer"), the ALM articles "Block unmanaged customizations" and "Removing dependencies", and the developer articles on `ExecuteMultiple` and service protection limits. All were read from the MicrosoftDocs `powerapps-docs` and `power-platform` GitHub sources, because learn.microsoft.com does not resolve from this sandbox. No live org, `$metadata` document, or SDK assembly was available. Claims marked "unverified" need a check against a live org during development. Where the plugin and the Microsoft reference disagree, the reference wins.

**Corrections to messages and metadata**

- `msdyn_componentlayer` is confirmed: TableType `Virtual`, OwnershipType `OrganizationOwned`, primary id `msdyn_componentlayerid`, primary name `msdyn_name`, entity set `msdyn_componentlayers`. The Web API equivalent of the query is `GET msdyn_componentlayers?$filter=msdyn_componentid eq '<id>' and msdyn_solutioncomponentname eq '<name>'`. The sidecar keeps using the SDK.
- **Correction: `msdyn_componentid` is a String column (max length 100), not a Guid.** The plugin passes a `Guid` value. Pass the id as a string in `Guid.ToString("D")` form. Do not depend on the server's casing either: compare ids case-insensitively when matching the returned rows. Whether lowercase and uppercase filter values both match is unverified.
- `msdyn_solutioncomponentname`, `msdyn_solutionname` and `msdyn_publishername` are String (100). `msdyn_changes` and `msdyn_componentjson` are String (max 1,073,741,823), so one row can be very large. `msdyn_children` is String (100) in the reference. That limit looks too small for a list of children, so treat the column as optional and possibly truncated or empty.
- `msdyn_order` is an Integer with range 0 to 500. `msdyn_overwritetime` (schema name `msdyn_endtime`) is a DateTime with `UserLocal` behavior. Return it as UTC ISO from the sidecar, and let the client format it.
- **Unverified: `msdyn_solutionversion`.** The researcher lists it, but the Microsoft reference does not list it among the table's columns. A `ColumnSet` that names a column the table lacks makes the whole query fault (`0x80041103` QueryBuilderNoAttribute). Either request `new ColumnSet(true)` (acceptable here, because one component returns only a handful of rows), or confirm the column once with `RetrieveEntityRequest(EntityFilters.Attributes)` before naming it. Make `solutionVersion` nullable in the DTO.
- The documented messages on the table are `Create`, `Update`, `Delete`, `Retrieve`, `RetrieveMultiple`, `Upsert` and `RetrieveEntityChanges`. Despite that list, the tool must only read. Never write to this table. Layer removal goes only through `RemoveActiveCustomizations`.
- `RemoveActiveCustomizations` is confirmed as a platform operation by its error codes (below) and by the maker UI "Remove active customizations" command. Its message contract was not available here, so these remain unverified: the exact parameter names (`SolutionComponentName` as String, `ComponentId` as Guid) and whether a typed `RemoveActiveCustomizationsRequest` exists in `Microsoft.CrmSdk.CoreAssemblies` 9.0.2.59, the version the sidecar references. Use an untyped `OrganizationRequest("RemoveActiveCustomizations")`; it works whether or not a typed class exists. Before writing the endpoint, the developer checks the action and its parameter names in the org's Web API `$metadata`. Pass `ComponentId` as a `Guid` parameter (not the layer's string column) and `SolutionComponentName` exactly as the layer row returned it.
- The removal is a metadata operation, not a record operation. Do not run it inside `ExecuteTransaction` or `ExecuteMultiple`. Send exactly one request per component.

**Component type to `msdyn_solutioncomponentname`**

- The `solutioncomponent.componenttype` reference confirms these type numbers: 1 Entity, 2 Attribute, 9 Option Set, 10 Entity Relationship, 20 Role, 24 Form, 26 Saved Query, 29 Workflow, 59 Saved Query Visualization, 60 System Form, 61 Web Resource, 62 Site Map, 91 Plugin Assembly, 92 SDK Message Processing Step, 93 SDK Message Processing Step Image, 300 Canvas App, 380 Environment Variable Definition.
- **Unverified: 80 (AppModule) and 418 (dataflow).** Neither number is in the documented static `componenttype` choice. 80 is widely used for model-driven apps, but resolve both at run time through `solutioncomponentdefinition`. Do not trust a hardcoded number for them. The 418 to `msdyn_dataflow` exception is a plugin claim with no Microsoft source.
- **Correction:** newer table-backed component types use the component table's object type code as their `componenttype` number. Those numbers are 10000 and above and differ between environments. Do not hardcode them. Key the static map by type number only for the classic types listed above. For anything else, read `solutioncomponentdefinition` (`solutioncomponenttype`, `name`) per connection and cache it per connection. `solutioncomponentdefinition` is not in Microsoft's public table reference, so it is an internal table. Treat its column names as unverified, and if the query faults, fall back to the static list only.
- The rule "filter by the type's name string, not its number" is a plugin claim that Microsoft does not document. It matches the String type of the column. Mark it unverified for every type outside Entity, Attribute, SystemForm, SavedQuery and WebResource until checked on a live org.
- Component ids by type: Entity, Attribute, OptionSet and EntityRelationship use the metadata `MetadataId`, not a record id. Role uses the root role. Business-unit copies of a role have `parentroleid` set, and the root has `parentroleid` null, so the brief's filter is right. Also return `roleid` and confirm against `parentrootroleid`. SystemForm filters by `objecttypecode` (a logical name string). SavedQuery filters by `returnedtypecode` (a logical name string).

**Paging, ordering and batching**

- Do not set `PageInfo`, `TopCount` or `Orders` on the `msdyn_componentlayer` query. Paging and server-side ordering on this virtual table's provider are undocumented. One component has a small number of layers, so read them all and sort in memory.
- **Correction to the sort.** The rule "sort by `msdyn_order` descending so Active sits on top" is unverified. Neither Microsoft nor the plugin defines the direction of `msdyn_order`. The maker UI shows the most recent layer at the top, which is "typically" the Active layer. Sort the Active row first, then the remaining rows by `msdyn_order` descending, and confirm the direction on a live org. If it is reversed, flip the secondary sort only.
- `NoLock` has no effect on a virtual table. Leave it out.
- The component search queries (`systemform`, `savedquery`, `webresource`, `workflow`, `role`, `appmodule`, `pluginassembly`, `sdkmessageprocessingstep`, `solutioncomponent`) are normal tables. Use `TopCount` = 50 for the picker. Any query that must return everything uses `PageInfo` with the paging cookie, up to 5,000 rows per page, following the `PolymorphicLookupService` pattern.
- `RetrieveAllEntitiesRequest(EntityFilters.Entity)` is heavy. Prefer `RetrieveMetadataChangesRequest` with a property filter of `MetadataId`, `LogicalName` and `DisplayName`, and cache the result per connection.
- The researcher's `ExecuteMultiple` notes apply only to a solution-wide mode, which v1 does not have. If one is added later: at most 1,000 requests per batch, no nesting, it is not a transaction, the old limit of 2 concurrent `ExecuteMultiple` calls is gone (service protection limits govern instead), and every `response.Fault` must be checked.
- Service protection limits (requests and execution time per user per 5 minutes) apply to every call. A single-component tool will not reach them, but map faults `0x80072322`, `0x80072321` and `0x80072326` (service protection: request count, execution time, concurrency) to 429 with the `Retry-After` value if one is returned.

**Privileges and connection requirements**

- One connection, no target. Confirmed.
- **Unverified:** which privileges read `msdyn_componentlayer` and run `RemoveActiveCustomizations`. Microsoft's reference lists no privilege names for either, and the maker docs do not name a role. Expect System Customizer or System Administrator, but do not hard-check roles. Do not call `WhoAmI` to gate the UI. Let the call fail and map the standard privilege fault (`0x80040220`, PrivilegeDenied) to 403. The plugin's claim that removal "faults without System Customizer or System Administrator" is unverified.
- Impersonation (`CallerId`) is not needed and should not be offered. Removal runs as the connected user, which is what the audit trail should show.
- The admin setting "Block unmanaged customizations" does **not** block removal. Microsoft lists "Remove an unmanaged layer" among the operations still allowed. So do not disable removal on such environments.

**Online versus on-premises**

- The sidecar supports both online (`ServiceClient`) and on-premises (`OnPremiseClient`) connections.
- **Unverified: on-premises.** Whether `msdyn_componentlayer` and `RemoveActiveCustomizations` exist on Dataverse on-premises (9.1) is not documented in the sources read. The table is a virtual table delivered with the online solution-layers feature. On the first layers call, treat the faults `0x80041102` (QueryBuilderNoEntity) and `0x80094005` (EntityNotFound) as "not available on this environment". Treat an unknown-message fault from `RemoveActiveCustomizations` the same way; its code was not found in the documented list. Return a distinct problem code, `layers_not_supported` with status 501, so the UI can show one clear message instead of a generic error.
- Online only: service protection throttling as above. Auth differences are already handled by `DataverseClientFactory`. This tool adds nothing.

**Solution and managed limits**

- Microsoft confirms: when the unmanaged layer is the only layer (the component is unmanaged at its base), it cannot be removed with remove active customizations. The component must be deleted instead. The researcher's ">1 layer and an Active layer" guard is correct and must stay server-side.
- Unmanaged solutions all share one Active layer. Removing it discards changes from every unmanaged solution, not just one. The rows do not say which unmanaged solution made a change.
- The Active layer row is identified by `msdyn_solutionname == "Active"`. That is a plugin claim. The maker UI labels the row "Unmanaged layer" in the Solution column, so the stored literal is unverified. Compare case-insensitively, and confirm the literal on a live org.
- Microsoft warns that removal "can't be reversed or undone" and that "all data associated with the unmanaged customization can be lost". For example, removing an Active layer that created a column on a managed table can drop that column and its data. The confirmation must say this.
- Managed components whose managed properties forbid customization cannot have an Active layer, so they are never removable. No special handling is needed beyond the guard.
- **Unverified: whether a publish is needed after removal** for forms, views, site maps or apps. Neither Microsoft source says. After removal, re-query the layers. If the Active row is gone, report success. Do not call `PublishXml` or `PublishAllXml` in v1. The UI may say that a publish might be needed to see the change in apps.

**Failure modes**

Map these documented `RemoveActiveCustomizations` faults by `OrganizationServiceFault.ErrorCode`. Pass Dataverse's message text through, and do not build the message from the code.

| Code | Name | Meaning | Suggested HTTP |
| --- | --- | --- | --- |
| `0x8004F059` | RemoveActiveCustomizationsNotSupported | Not supported for this component type | 422 |
| `0x8004F053` | RemoveActiveCustomizationsNotSupportOnAttributeType | Not supported for this attribute type | 422 |
| `0x8004F075` | RemoveActiveCustomizationsFailedForEntity | A table property differs between the Active layer and the managed layer, and the values must match | 422 |
| `0x8004F076` | RACForEntityFailedNotActiveLayer | The targeted layer is not the Active layer | 409 |
| `0x8004F077` | RACCannotAcquireCustomizationLock | Another metadata operation, such as a solution import or publish, holds the customization lock. Try again later | 409, retryable |
| `0x80040220` | PrivilegeDenied | Caller lacks the privilege | 403 |

- `0x8004F095` and `0x8004F094` (BulkRACAllErrors and BulkRACPartialErrors) show that a server-side bulk variant exists, with partial success. Its message name is undocumented. Do not use it in v1.
- The fault code for "only layer, cannot remove" was not found. The server-side guard prevents that call, so map any other fault to 422.
- Removal can run long on large tables. The client timeout must cover it. Check `ServiceClient`'s configured timeout, and do not retry automatically on timeout, because the operation may have completed. Re-query the layers instead and report what is there.
- Layer reads: a type name the server does not recognize, or a component with no layers, returns zero rows rather than a fault. Return an empty layer list, not an error. Some type names may fault instead (unverified). Map those to 422 with the message.
- Large `msdyn_componentjson` values (big forms, web resources) can make the response several MB. Do not log the payload.

**Plugin claims that are wrong**

- `msdyn_componentid` is filtered with a `Guid` value. The column is a String.
- The plugin relies on server row order. `msdyn_order` direction is not guaranteed, so sort explicitly as described above.
- The plugin does not check `ExecuteMultiple` `response.Fault`, and does not page `solutioncomponent` past 5,000 rows. The researcher already flagged both. Confirmed as defects against the documented contracts.
- One failed removal aborts the plugin's whole loop, with no per-item result. For v1 that does not matter, since it removes one component at a time. Any later bulk mode must report results per component.

**Plugin claims that remain unverified**

- That `msdyn_solutioncomponentname` is the type's enum name for every type, the 418 to `msdyn_dataflow` exception, and that `solutioncomponentdefinition.name` equals the layer name for newer types.
- That the `msdyn_solutionversion` column exists.
- That the Active layer's `msdyn_solutionname` is exactly `"Active"`.
- The shape `{ "Attributes": [ { "Key", "Value" } ] }` of `msdyn_componentjson`, and that web resource `content` in it is base64. The client parser must tolerate other shapes and show the raw text.
- The `RemoveActiveCustomizations` parameter names and types, and the privileges it requires.
- Whether a publish is needed after removal.
- Availability on on-premises.

### UX

Written from `### What it does` only: list a component's layers, inspect one layer (Changes, All properties, Children), compare two layers, and remove the Active layer singly or in bulk after a confirmation. Solution-wide browsing, Excel export, and cross-tool links are out of v1.

#### Sidebar

- Tool id `solution-layers-explorer`. Show it in the activity bar (`showInActivityBar: true`), one row under the existing Search tools field.
- Title: **Solution Layers Explorer**. Tooltip: **Inspect and compare the solution layers of a component, and remove its unmanaged Active layer**. The tooltip is the activity-bar button `title` and accessible name.
- More than one tab (`allowMultipleInstances: true`). Choosing the sidebar entry again opens another tab. Each tab keeps its own component type, search text, checked components, selected component, selected layer, detail tab, compare pair, "only differences" setting, chosen property, and removal results. Every tab follows the selected environment.
- Icon: a new single-color SVG of stacked layers, drawn through `ToolIcon`. Do not reuse the plugin icon.

#### Public listing

- Title: **Solution Layers Explorer**.
- Description: **See every solution layer of a Dataverse component, compare any two layers side by side, and remove the unmanaged Active layer.**
- Add it to `publicCatalog.ts` in the same position as in `ACTIVITY_BAR_TOOLS`. Do not edit the welcome page or website markup.

#### Title bar

No title-bar menu item. File, Edit, View, and Help stay unchanged. Every action lives on the tool tab.

#### Tool tab

The tab is `bg-canvas`. The environment is the connection chosen in the sidebar footer. There is no connection picker in the tab.

The surface is split left and right with a draggable divider. Use `Group`, `Panel`, and `Separator` from `react-resizable-panels`, as in `desktop/src/ui/shell/layout/Layout.tsx`, `orientation="horizontal"`.

- Left `Panel` `id="sle-components"`: the component picker. `defaultSize="32%"`, `minSize="22%"`.
- `Separator` `aria-label="Resize panes"`, classes `w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent`.
- Right `Panel` `id="sle-layers"`: the layers of the selected component. `minSize="40%"`.

The right panel is split again, top and bottom, with a second draggable divider: `Group orientation="vertical"`.

- Top `Panel` `id="sle-layer-list"`: the layer table. `defaultSize="35%"`, `minSize="15%"`.
- `Separator` `aria-label="Resize layer details"`, classes `h-1 cursor-row-resize bg-raised hover:bg-accent active:bg-accent`.
- Bottom `Panel` `id="sle-layer-view"`: details and compare. `minSize="30%"`.

Panels are `bg-surface`. Headings are `text-fg-strong`, values `text-fg`, hints and metadata `text-fg-muted`. Component names in code-like places (logical names, GUIDs, JSON) use `font-mono`.

##### 1. No environment

Every pane shows one `EmptyState`: **Select an environment** with the description "Choose an environment in the connection control at the bottom of the sidebar." The type select, search, and every action are disabled. Nothing is loaded.

##### 2. Component picker (left)

A `Toolbar` with a `Field` labeled **Component type** holding a `Select`. Options are the supported component types, by display label (Table, Column, Choice, Relationship, Security role, Form, View, Chart, Web resource, Process, Model-driven app, Plug-in assembly, Plug-in step, Canvas app). Default: **Table** (changed from Web resource at the user's request). Types the environment does not support are left out.

- When the type is **Column**, a second `Field` labeled **Table** holding a `Select` of tables appears under it, required. The search is disabled until a table is chosen.
- When the type is **Form** or **View**, the same **Table** select appears and is optional, with first option **All tables**.

Below it, `SearchInput` with placeholder **Search by name**. Typing searches after a short pause (about 300 ms). An empty search lists the first matches for the type. Changing the type clears the search, the results, and the checks, and keeps the selected component on the right until another is picked.

Results are a `DataTable` (row key = component id), columns:

| Header | Content | Sortable |
| --- | --- | --- |
| (checkbox) | `Checkbox` for bulk removal. Header checkbox **Select all components** checks or clears all visible rows and shows indeterminate for a partial set. | No |
| Name | Display name, or the name when there is none | Yes |
| Logical Name | Schema or unique name in `font-mono` | Yes |
| Table | Parent table logical name, blank when none | Yes |

Sorting is a click on a column header: first click ascending, the same header again descending, ↑ or ↓ on the active header. Default: Name ascending. No separate sort buttons. Headers are title case as written.

The result count is capped by the server. When the cap is reached, a `text-xs text-fg-muted` line under the table reads "Showing the first 50 matches. Refine the search to narrow the list."

Clicking a row selects it (`selectedKey`, `bg-accent-soft`) and loads its layers on the right. Checking a box does not select the row.

Under the table, `Button` variant `danger` size `sm` **Remove Active layers (N)**, enabled when at least one component is checked. It opens the bulk removal dialog (step 6).

##### 3. Layer list (right, top)

A header row shows the selected component: name in `text-base font-semibold text-fg-strong`, then type and logical name in `text-xs text-fg-muted`. On its right: an icon `Button` variant `ghost` with `RotateCw`, `aria-label="Reload layers"`, and `Button` variant `danger` **Remove Active layer**.

**Remove Active layer** is enabled only when the component has an Active layer and at least one other layer under it. When disabled, a `Tooltip` explains why: "No Active layer" or "This component exists only in the Active layer, so there is nothing to fall back to."

The layer table is a `DataTable` (row key = layer id), sorted top to bottom from the highest order to the lowest, so Active sits on top and the base layer at the bottom. Columns:

| Header | Content |
| --- | --- |
| Order | Stack position number |
| Solution | Solution name. The Active row adds `Badge` tone `accent` **Active**. |
| Publisher | Publisher name |
| Version | Solution version, blank for Active |
| Overwrite Time | Local date and time; blank when not set |

The stack order is the meaning of this table, so it is not sortable by header.

Clicking a row selects it (`selectedKey`) and shows its details below. When layers load, the top layer is selected.

##### 4. Layer details (right, bottom, Details tab)

The bottom pane is a `Tabs` with two tabs, `aria-label="Layer view"`: **Details** and **Compare**.

**Details** shows the selected layer. A line at the top names it: "Layer {order} · {solution name}". Under it, a second `Tabs` with `aria-label="Layer content"`:

- **Changes**: what this layer altered.
- **All properties**: the full component state in this layer.
- **Children**: child components.

Each shows the value as pretty-printed JSON in a read-only `CodeEditor` (`readOnly`, `lineNumbers`, `flex-1`), `aria-label` "Changes", "All properties", or "Children". When the value is not valid JSON, show the raw text unchanged in the same editor. When the value is empty, show `EmptyState` "This layer records no changes." / "This layer has no properties." / "This layer has no child components."

The last chosen inner tab stays chosen when another layer is selected.

##### 5. Compare (right, bottom, Compare tab)

A `Toolbar` with two `Field`s holding `Select`s: **Left layer** and **Right layer**. Options are "{order} · {solution name}" for each layer. Defaults: Left = the layer directly under the top layer, Right = the top layer. When the component has only one layer, both selects show that layer and the pane shows `EmptyState` "This component has only one layer. There is nothing to compare." Picking the same layer on both sides shows `Alert` tone `info` "Both sides show the same layer." and still renders.

On the right of the toolbar, `Checkbox` labeled **Only differences**, unchecked by default.

Below the toolbar, a second horizontal split with a draggable divider (`Group orientation="horizontal"`, `Separator aria-label="Resize compare panes"`, `w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent`):

- Left `Panel` (`defaultSize="35%"`, `minSize="20%"`): a property `DataTable` (row key = property key). Columns **Property** (`font-mono`) and **Status**. Status is `Badge` tone `warn` **Different**, tone `neutral` **Only left**, tone `neutral` **Only right**, or empty when equal. Sortable by click on either header, first click ascending; default Property ascending. With **Only differences** checked, equal rows are hidden; when none remain, the table empty message is "No differences between these layers." Clicking a row chooses that property (`selectedKey`).
- Right `Panel` (`minSize="35%"`): a read-only side-by-side text diff of the chosen property, left layer value on the left and right layer value on the right, changed lines highlighted. Values that parse as JSON are pretty-printed first. For a web resource, the `content` property is decoded from base64 to text before diffing, and a `text-xs text-fg-muted` note above the diff reads "Decoded from base64." Before a property is chosen, show `EmptyState` "Select a property to see its values side by side."

The diff uses `@codemirror/merge` (approved). The merge view must load on first use, like `CodeEditor`: a lazy import inside the tool folder, never a static import from app code, so CodeMirror stays out of the main bundle. Show a same-sized frame with `Spinner` until it loads. Highlight colors come from theme tokens (`ok-soft` for added lines, `danger-soft` for removed lines, applied through `var(--color-…)` in the editor theme). Do not add the diff view to `desktop/src/ui/shared/ui`.

Changing either layer keeps the chosen property when it exists in both, and clears it otherwise.

##### 6. Remove the Active layer

**Single.** **Remove Active layer** opens a `Modal` titled **Remove Active layer**.

- Body: "Remove the unmanaged Active layer of **{component name}** ({type})? The component falls back to the layer below: **{solution name}** {version}."
- `Alert` tone `warn`: "This permanently discards unmanaged customizations for this component. It cannot be undone. Some components, such as forms, views, and site maps, may need a publish before the change appears."
- Buttons: `Button` secondary **Cancel** first, then `Button` variant `danger` **Remove Active layer**.
- While the request runs, the `Modal` is `busy` with busy label "Removing Active layer…", and cannot be closed.
- On success the dialog closes, the layer list reloads, the top layer is selected, and the Compare selects reset to their defaults.

**Bulk.** **Remove Active layers (N)** in the picker opens a `Modal` titled **Remove Active layers**.

- Body: "Remove the unmanaged Active layer of these N components?" followed by a scrolling list of the checked component names (max height, `text-sm text-fg`).
- The same `Alert` tone `warn` as the single dialog.
- `Button` secondary **Cancel**, then `Button` variant `danger` **Remove N Active layers**.
- On confirm, the dialog stays open and switches to progress: a `ProgressBar` for done out of N, and a `DataTable` with columns **Component**, **Result**, **Detail**, one row per component as it finishes. Result is the word **Removed**, **Skipped**, or **Failed**, with `Badge` tones `ok`, `neutral`, `danger`. Skipped means the component has no Active layer above another layer; Detail says which. Failed shows the error text in Detail. One failure never stops the run.
- Components run one at a time. While running, the footer shows `Button` secondary **Stop**, which finishes the current component and does not start the next. Closing is blocked while a request is in flight.
- When the run ends, the footer shows `Button` primary **Done**. Done closes the dialog, clears the checks, and reloads the layers of the selected component if it was in the run.

#### States

- **Loading.**
  - Component types or search results: `Spinner` in the picker table area. Status `Searching components…`.
  - Layers: `Spinner` centered in the right panel; the previous component's layers are cleared, not shown stale. Status `Loading layers…`. Layer loads can be slow for big forms and web resources; nothing is prefetched.
  - Diff view first load: same-sized frame with `Spinner`.
  - Removal: `Modal` `busy` (single) or `ProgressBar` (bulk). Status `Removing Active layer…` or `Removing Active layers: n of N`.
- **Empty.**
  - No environment: step 1. Status `No environment selected`.
  - No component selected: right panel `EmptyState` "Select a component to see its solution layers."
  - Search with no results: table empty message "No matching components".
  - Column type without a table: picker `EmptyState` "Choose a table to search its columns."
  - Component with no layer rows: right panel `EmptyState` "No solution layers were found for this component." Remove is disabled. This is not an error.
  - Layer content empty, one-layer compare, no differences: messages in steps 4 and 5.
- **Success.**
  - Layers loaded: status `N layers · Active layer present` or `N layers · No Active layer`. No toast.
  - Single removal: `useToast` success "Active layer removed." Status reflects the reloaded layers.
  - Bulk removal: `useToast` success "Removed N Active layers." when all were removed; `useToast` info "Removed X of N Active layers. Y skipped, Z failed." otherwise.
- **Error.**
  - Component search or type list failure: `Alert` tone `danger` in the picker with the error text and `Button` secondary **Retry**. Status `Could not search components`.
  - Layer load failure: `Alert` tone `danger` in the right panel with the error text and **Retry**. Status `Could not load layers`. A permission failure reads "You need System Customizer or System Administrator rights to read solution layers."
  - Single removal failure: the dialog stays open, leaves `busy`, and shows `Alert` tone `danger` with the error text above the buttons. A permission failure reads "You need System Customizer or System Administrator rights to remove the Active layer." A refusal because the layer cannot be removed reads "This component no longer has an Active layer above another layer." and the layer list reloads. `useToast` error with the same text.
  - Bulk failures: per-row **Failed** as in step 6. `useToast` error "No Active layers were removed." when nothing succeeded.
  - Malformed layer JSON is not an error: show the raw text (step 4) and, in Compare, treat the layer as having no parsed properties with `Alert` tone `warn` "One layer's properties could not be read as JSON."
- **Environment change.** Clear the search results, checks, selected component, layers, and compare state, and reload component types. A bulk removal already running keeps going against the environment it started on, and its dialog heading names that environment.

#### Shared controls

From `desktop/src/ui/shared/ui`:

- `Button`: Remove Active layer, Remove Active layers (N), Cancel, Remove N Active layers, Stop, Done, Retry, Reload layers (ghost icon button).
- `Checkbox`: component checks for bulk removal, Select all components, Only differences.
- `DataTable`: component results, layer list, compare property list, bulk removal results.
- `Modal`: single and bulk removal confirmation.
- `ProgressBar`: bulk removal.
- `SearchInput`: component search.
- `Spinner`: loading states and the diff view frame.
- `Toast` and `useToast`: removal results and failures.
- Also exported there and used: `Field`, `Select`, `Tabs`, `CodeEditor` (read-only JSON), `Badge`, `Alert`, `EmptyState`, `Toolbar`, `Tooltip`.
- `useToolStatus` for the status strings above. The tool does not manage status ids.
- `Group`, `Panel`, `Separator` from `react-resizable-panels` for the three draggable dividers.
- Icons from `lucide-react` (`RotateCw`, `Layers`), `size={14}`, `aria-hidden="true"`.

#### Colors

Tokens only: `bg-canvas` for the tab, `bg-surface` for panels, `bg-raised` for dividers with `hover:bg-accent` and `active:bg-accent`, `bg-accent-soft` for selected rows, `text-fg-strong` for headings, `text-fg` for values, `text-fg-muted` for hints and metadata, `danger` for removal buttons and errors, `warn` for the Different badge and the removal warning, `ok-soft` and `danger-soft` for diff line highlights. No hex values.

#### What not to build

- Browsing a whole solution to find components that have an Active layer. The picker searches one component type at a time.
- Excel or any other export, and links into other tools.
- Removing managed layers, reordering layers, or editing any layer content. Everything except Active removal is read-only.
- Publishing after removal. The dialog warns that a publish may be needed; it does not publish.
- A second environment or comparing layers across environments.
- A connection picker inside the tab, or a File, Edit, View, or Help menu item.
- The plugin's WinForms layout: its docked solution picker, its separate comparer window, its fixed-size grids, and its log text box. This tab is a picker, a layer table, and a details/compare pane, each split by a draggable divider.
- A preselected second layer by fixed index. Compare defaults follow step 5.
- A separate row of sort buttons, all-capital column headers, or a sortable layer table.
- New controls in `desktop/src/ui/shared/ui`, including a shared diff control.
- XrmToolBox host chrome, the plugin icon, and the plugin's labels and dialog text.

### Implementation notes and test evidence

**Files added**

- Sidecar, `api/PowerTools/PowerTools.API/Tools/SolutionLayers/`:
  - `ComponentLayerNames.cs`: our own map from the documented `componenttype` numbers (1, 2, 9, 10, 20, 26, 29, 59, 60, 61, 91, 92, 300) to the `msdyn_solutioncomponentname` filter value. Model-driven apps are not hardcoded as 80; their number is read from the `solutioncomponentdefinition` row whose `primaryentityname` is `appmodule`, and the type is left out of the picker when that row is missing. Any other number falls back to `solutioncomponentdefinition.name`. Type 418 (dataflow) is not mapped, because the UX picker does not list it.
  - `SolutionLayersQueries.cs`, `SolutionLayersService.cs`, `SolutionLayersClient.cs` (client interface plus a per-connection five-minute cache), `SolutionLayersFaults.cs`, `SolutionLayersDtos.cs`, `SolutionLayersEndpoints.cs`.
  - `Program.cs`: `app.MapSolutionLayersEndpoints();` and the cache singleton.
  - Tests: new project `api/PowerTools/PowerTools.API.SolutionLayers.Tests/` (added to `PowerTools.sln`) with a fake client. No Dataverse connection is used.
- Desktop, `desktop/src/ui/tools/solution-layers-explorer/`: `tool.ts`, a new stacked-layers icon, `SolutionLayersExplorer.tsx`, `api/` (query keys, react-query hooks with `meta.connectionName`), `model/` (`componentJson.ts`, `view.ts`, `apiError.ts`, `types.ts`), `components/` (`ComponentPicker`, `LayerList`, `LayerDetails`, `LayerCompare`, `LayerDiff` with its lazy loader, `MergeDiffView`, `RemoveActiveDialog`, `BulkRemoveDialog`), and `tests/` (fixtures, node tests, MSW renderer tests).
- One entry each in `registry.tsx` and `publicCatalog.ts`, after Solution Components Mover. `test/toolRegistry.test.ts` now expects the new id in that order.
- Dependency: `@codemirror/merge@^6.12.2` (MIT, approved in Open questions).

**Endpoints** (group `/api/solution-layers`, `DataverseContextFilter`, organization service from `DataverseClientFactory`, one connection)

- `GET /component-types` returns `{ componentTypes: [{ componentType, name, layerName, label, supported }] }`. If `solutioncomponentdefinition` cannot be read, it returns the documented types only and does not fail.
- `GET /components?componentType=&search=&entity=` returns `{ components: [{ componentId, componentType, name, logicalName, parentEntity }], truncated }`:
  - Normal tables use `TopCount` 51. The response shows 50 and sets `truncated`.
  - LIKE wildcards in the search text are escaped.
  - Forms filter on `objecttypecode`, views on `returnedtypecode`, charts on `primaryentitytypecode`.
  - Roles use `parentroleid` null. Processes use `type` = 1.
  - Tables, relationships and global choices come from metadata messages and are filtered in memory. Tables and relationships are read once per connection, through `RetrieveMetadataChangesRequest` with only the properties the picker shows.
  - Columns need `entity`. They return each attribute's `MetadataId` and skip `AttributeOf` columns.
  - `logicalName` and `parentEntity` are additions to the researcher's contract, because the UX table shows Logical Name and Table. `truncated` is also an addition, used for the cap message.
- `GET /layers?componentType=&componentId=` reads `msdyn_componentlayer` as follows:
  - Two conditions. `msdyn_componentid` is passed as a `D`-format string.
  - `ColumnSet(true)`, no paging, no order and no `NoLock`, as the Dataverse review asks.
  - Rows whose id does not match, compared case-insensitively, are dropped.
  - Sort: Active first (`msdyn_solutionname` compared case-insensitively to `Active`), then `msdyn_order` descending.
  - `canRemoveActive` = an Active layer exists and more than one layer exists. The three JSON columns are returned raw. `overwriteTime` is a UTC ISO string. `solutionVersion` is nullable and blank for Active.
- `POST /remove-active` with `{ componentType, componentId }`:
  1. Re-reads the layers. It refuses with 409 `NoActiveLayer` or `OnlyActiveLayer` before calling Dataverse.
  2. Sends one untyped `OrganizationRequest("RemoveActiveCustomizations")`, with `SolutionComponentName` exactly as the Active row returned it and `ComponentId` as a `Guid`.
  3. Re-reads the layers and returns them.
  - A timeout is not retried. The layers are re-read: success if the Active row is gone, otherwise 504.
  - Faults, with the Dataverse message passed through: `0x80040220` returns 403. `0x8004F076` and `0x8004F077` return 409. `0x8004F059`, `0x8004F053`, `0x8004F075` and anything else return 422. Service protection returns 429, with Retry-After appended to the message. `0x80041102` and `0x80094005` return 501 `layers_not_supported`.
- The renderer sends the removal with `noAuthRetry: true`, so a 401 never replays it.

**Behavior taken from the brief**

- UX steps 1 to 6 are built as written:
  - three draggable dividers, using the panel ids and sizes from the UX section;
  - Table is the default type (originally Web resource; changed at the user's request);
  - the Table select is required for Column and optional (All tables) for Form and View;
  - search runs 300 ms after typing stops;
  - checkbox column with Select all, and header-click sorting;
  - the 50-match cap line;
  - the non-sortable layer table with the Active badge;
  - Details with Changes / All properties / Children in read-only `CodeEditor`s; non-JSON text is shown raw;
  - Compare with Left and Right defaults, Only differences, the property table with Different / Only left / Only right badges, the same-layer info and malformed-JSON warn alerts;
  - the side-by-side diff with base64-decoded web resource `content` and the "Decoded from base64." note;
  - the single removal `Modal`, busy while it runs, with error alerts;
  - bulk removal run one component at a time, with Stop, per-row Removed / Skipped / Failed results and Done;
  - the status strings and toasts from States.
- The diff uses `@codemirror/merge`. It is loaded lazily from inside the tool folder (`components/loadLayerDiff.ts`), with a same-sized frame and `Spinner` until it loads. Highlights use the `danger-soft` and `ok-soft` tokens. `vite build` emits it as its own `MergeDiffView` chunk, and CodeMirror stays out of the main bundle.
- When the environment changes, the page is re-keyed, which clears the search, checks, selection, layers and compare state. A bulk run already in progress is held above that key. It keeps using the connection it started on, and its dialog description names that environment.
- Everything is clean-room. No MscrmTools source, layout, icon or wording was used.

**Commands and results**

- `dotnet build api/PowerTools/PowerTools.sln`: succeeded, 0 warnings, 0 errors. The sandbox has only the .NET 10 SDK (Ubuntu package; dot.net is blocked by the egress proxy). It builds the `net9.0` projects.
- `dotnet test api/PowerTools/PowerTools.sln` with `DOTNET_ROLL_FORWARD=Major`, because only the .NET 10 runtime is installed: all 8 test projects pass, 287 tests in total. The new `PowerTools.API.SolutionLayers.Tests` has 29 tests: mapping, query shape, sorting, guard, faults, timeout, type list and search.
- `npm test` (desktop): 86 files, 491 tests pass. The new tool adds 13 node tests and 14 renderer tests.
- `npm run lint`: clean.
- `npm run build`: succeeds. Vite's warning that a chunk is larger than 500 kB was already there before this change. The main chunk grows by about 26 kB.
- `npm run check`:
  - typecheck, `lint --max-warnings 0`, tests and `build:renderer` all pass;
  - `test:smoke:run` fails here. Without a display Electron cannot start. Under `xvfb-run` the test times out after 120 s;
  - the same smoke test also times out on the unchanged base commit in this sandbox, so this is an environment limit, not this change.

**Not verified (no live org)**

- Each item marked unverified in the Dataverse review is handled defensively, not confirmed:
  - the `Active` literal;
  - the direction of `msdyn_order`;
  - the `msdyn_solutionversion` column;
  - the name strings for types other than Entity, Attribute, SystemForm, SavedQuery and WebResource;
  - the `RemoveActiveCustomizations` parameter names;
  - on-premises availability.
- The `solutioncomponentdefinition` column names are also unverified. So is the `appmoduleid` component id for model-driven apps.


#### Follow-up: collapse and expand

At the user's request, the Details editors and both sides of the Compare diff can collapse and expand indented blocks. The arrows are in the gutter, and the keys are Ctrl+Shift+[ and Ctrl+Shift+]. Folding works by indentation (`shared/ui/codeFolding.ts`), so it covers formatted JSON, XML and decoded scripts, and needs no new dependency. `CodeEditor` gains an opt-in `folding` prop, so other tools are unchanged. In the diff, unchanged stretches of 8 or more lines also collapse into a clickable "unchanged lines" bar (`collapseUnchanged` from `@codemirror/merge`). The folding code loads in its own chunk, and the main bundle is unchanged. Tests: `codeFolding.test.ts` (node) and a `CodeEditor` renderer test. `npm test` (495), lint, typecheck and build pass.


#### Follow-up: property view

At the user's request, Changes and All properties now open as a property table, with a **Properties | JSON** switch that keeps the raw view.
- **Table:** short values (80 characters or fewer, on one line) show in full. Longer values show a summary such as "XML · 120 lines" or "Decoded Text · 2 lines". A filter narrows the properties by name.
- **Value pane:** selecting a row shows the whole value below, formatted, in a read-only editor that can collapse and expand. XML strings are indented, JSON text and objects are formatted, and web resource content is decoded from base64.
- **Unreadable data:** layer data that is not readable as properties falls back to the raw text, with a warning.
- **Children:** stays JSON.
- **Compare:** gains a Values column. A change shows `old → new` when both values are short, and a property on one side only shows that side's value. The side-by-side diff uses the same formatting, so form and view XML diff line by line instead of as one escaped string.

Model: `model/propertyValue.ts` (`formatXml`, `displayValue`, `shortValue`, `valueSummary`), replacing `diffValue` and `formatValue`. Tests: `tests/node/propertyValue.test.ts`, plus renderer coverage for the table, the filter, the value pane, the JSON switch, the fallback, and inline compare values. `npm test` (500), lint, typecheck and build pass.

### Open questions

- Resolved: the source plugin is GPL-3.0. The user accepted a clean-room build. No plugin source, UI, icons or wording is copied; Dataverse behavior is reimplemented from this brief and Microsoft documentation.
- Resolved: v1 includes "Remove active layer" (`RemoveActiveCustomizations`) with a confirmation dialog, a server-side guard (more than one layer and an Active layer present), and a layer reload after removal.
- Resolved: the user approved adding `@codemirror/merge` (MIT) for the side-by-side layer diff.
