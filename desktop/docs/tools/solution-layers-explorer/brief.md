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

### Open questions

- Resolved: the source plugin is GPL-3.0. The user accepted a clean-room build. No plugin source, UI, icons or wording is copied; Dataverse behavior is reimplemented from this brief and Microsoft documentation.
- Resolved: v1 includes "Remove active layer" (`RemoveActiveCustomizations`) with a confirmation dialog, a server-side guard (more than one layer and an Active layer present), and a layer reload after removal.
- Resolved: the user approved adding `@codemirror/merge` (MIT) for the side-by-side layer diff.
