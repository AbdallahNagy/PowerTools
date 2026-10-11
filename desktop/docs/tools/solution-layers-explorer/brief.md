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

A `Toolbar` with a `Field` labeled **Component type** holding a `Select`. Options are the supported component types, by display label (Table, Column, Choice, Relationship, Security role, Form, View, Chart, Web resource, Process, Model-driven app, Plug-in assembly, Plug-in step, Canvas app). Default: **Web resource**. Types the environment does not support are left out.

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

### Open questions

- Resolved: the source plugin is GPL-3.0. The user accepted a clean-room build. No plugin source, UI, icons or wording is copied; Dataverse behavior is reimplemented from this brief and Microsoft documentation.
- Resolved: v1 includes "Remove active layer" (`RemoveActiveCustomizations`) with a confirmation dialog, a server-side guard (more than one layer and an Active layer present), and a layer reload after removal.
- Resolved: the user approved adding `@codemirror/merge` (MIT) for the side-by-side layer diff.
