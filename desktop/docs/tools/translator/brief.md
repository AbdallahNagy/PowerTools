### Match

- **Plugin:** Easy Translator for XrmToolBox
  - Catalog: https://www.xrmtoolbox.com/plugins/MsCrmTools.Translator/
  - NuGet id: `MsCrmTools.Translator`
  - Author: MscrmTools (Tanguy Touzard)
  - Description: "Exports and Imports translations with contextual information"
- **Version:** the latest on NuGet is **1.2025.8.27**, published 2025-08-27. The `.nuspec` in the repo still says 1.2021.4.15. The last commit is 2025-08-27, so it is maintained.
- **Source:** https://github.com/MscrmTools/MsCrmTools.Translator. I cloned it into the scratchpad. All code cited below is under `MsCrmTools.Translator/`.
- **License: GPL-3.0** (`LICENSE` in the repo root). The NuGet package has no license URL. The plugin also uses EPPlus 4.x for Excel files.
  - Power Tools is MIT, so we treat the plugin as **inspiration-only**.
  - We can reuse what it teaches about Dataverse messages, metadata rules and edge cases. We copy no code, no WinForms UI, no icons and none of its wording.
- **Other plugins:** none would add backend knowledge. Easy Translator is the standard XrmToolBox tool for this job.
- **Confidence: high.** The name and NuGet id match exactly, the source is public, and I read the backend code directly.
- **Existing Power Tools coverage: none.**
  - Attribute Explorer only reads display names in one language.
  - Polymorphic Lookup Creator writes labels in the base language only.
  - No sidecar endpoint reads or writes labels for more than one language. This is a new tool, not an extension of FetchXML Builder or Data Migration.

### What it does

**Export.** It writes a workbook with one sheet per component type. Each row identifies one label and has one column per language (LCID: the numeric Dataverse language code). It covers:
- tables (display name, plural name, description)
- columns (display name, description)
- local choices (option labels and descriptions)
- global choices, including global Yes/No sets
- Yes/No columns (true and false labels)
- relationships, only those set to show a custom label in the related-records menu (1:N and N:N)
- views (system views)
- charts
- forms: form names, tabs, sections, header, body and footer field labels
- dashboards: names, tabs, sections, field labels
- SiteMap areas, groups and subareas

**Export options:**
- all provisioned languages, or the base language plus one other language
- names only, descriptions only, or both
- filter tables by solution

**Import.** It reads the same workbook back, updates labels in batches of a size the user picks, logs each failure, and runs Publish All at the end.

### Backend findings

**Languages**
- The base language comes from `organization.languagecode` via `RetrieveMultiple` (`Engine.cs:33-36`, `FormTranslation.cs:965-972`).
- Other languages come from `RetrieveProvisionedLanguagesRequest` (`Engine.cs:47-49`, `MainControl.cs:373-375`).
- LCIDs are sorted. The base language is always included when the user picks one target language (`Engine.cs:38`).

**Choosing tables**
- With no solution filter: `RetrieveAllEntitiesRequest` with `EntityFilters.Entity`. It keeps tables that have a display name and are customizable or unmanaged (`MetadataHelper.cs:28-44`).
- With a solution filter: it queries `solutioncomponent` where `componenttype = 1` and `solutionid = X`. It then runs `RetrieveMetadataChangesRequest` with an `EntityQueryExpression` that ORs `MetadataId` conditions, **100 ids per request** (`MetadataHelper.cs:47-98`).
- Risk: the `solutioncomponent` query has no paging, so it reads at most 5,000 rows.

**Loading metadata for export**
- `RetrieveMetadataChangesRequest`, chunked into groups of 100 logical names (`Engine.cs:62-103`).
- It asks only for `DisplayName`, `DisplayCollectionName`, `Description`, `SchemaName`, `LogicalName` and `ObjectTypeCode`.
- It adds `Attributes` and the three relationship collections only when those sheets are selected.
- This is the efficient pattern to keep: do not pull full metadata for every table.

**Tables**
- Export reads `LocalizedLabels` per LCID (`AppCode/EntityTranslation.cs:217-302`).
- Import sends `UpdateEntityRequest { Entity = new EntityMetadata { LogicalName, DisplayName, DisplayCollectionName, Description }, MergeLabels = true }` (`EntityTranslation.cs:428-445`).
- It skips tables where `IsRenameable == false`.
- Gotcha: on import it replaces the plural name and description with a new `Label` built only from the workbook cells. It relies on `MergeLabels = true` to keep languages that are not in the file.

**Columns**
- Export skips these (`AppCode/AttributeTranslation.cs:503-538`):
  - types BigInt, CalendarRules, EntityName, ManagedProperty and Uniqueidentifier
  - Virtual columns, except multi-select choices
  - columns where `AttributeOf != null`
  - columns where `IsRenameable == false`
  - columns whose labels are all empty
  - rollup helper columns: `X_state` and `X_date` when the base column `X` exists
- Import sends `UpdateAttributeRequest { Attribute, EntityName, MergeLabels = true }` (`AttributeTranslation.cs:714-736`).
- Import starts from metadata fetched with `RetrieveEntityRequest(Entity | Attributes | Relationships)`, edits its labels, and sends the whole attribute back.
- It logs a warning and skips when a column has been deleted (`AttributeTranslation.cs:646-655`).

**Local choices**
- Export covers Picklist, State, Status and multi-select choices, and skips any column that uses a global choice (`AppCode/OptionSetTranslation.cs:39-75`).
- Import sends `UpdateOptionValueRequest { EntityLogicalName, AttributeLogicalName, Value, Label, Description, MergeLabels = true }` (`OptionSetTranslation.cs:202-220`).
- Plugin bug: its de-duplication check compares `OptionSetName` with the entity name. `OptionSetName` is always null for local choices, so the label row and the description row for the same option become two separate requests.
- Also, multi-select choices are exported but not matched on import: only Picklist, State and Status are matched, and the rest log "Unable to determine type". Power Tools should handle multi-select choices too.

**Global choices**
- Export uses `RetrieveAllOptionSetsRequest`, filtered by solution with `componenttype = 9` (`AppCode/GlobalOptionSetTranslation.cs:36-43`).
- Import first sends `RetrieveOptionSetRequest { Name, RetrieveAsIfPublished = true }`, then `UpdateOptionValueRequest { OptionSetName, Value, ... MergeLabels = true }`.
- Global Yes/No sets are handled as value 0 = `FalseOption` and 1 = `TrueOption` (`GlobalOptionSetTranslation.cs:252-290`).

**Yes/No columns**
- `UpdateOptionValueRequest` with value 0 or 1 on the entity and column (`AppCode/BooleanTranslation.cs:210-233`).

**Relationships**
- Only relationships where `AssociatedMenuConfiguration.Behavior == UseLabel` (`AppCode/RelationshipTranslation.cs:24-25`).
- Import sends `UpdateRelationshipRequest { Relationship, MergeLabels = true }`.
- 1:N relationships use `AssociatedMenuConfiguration.Label` (`RelationshipTranslation.cs:164`).
- N:N relationships use `Entity1AssociatedMenuConfiguration` and `Entity2AssociatedMenuConfiguration` (`RelationshipNnTranslation.cs:134-192`).

**Views and charts**
- Views are queried as `savedquery` by `returnedtypecode` = ObjectTypeCode, with columns `returnedtypecode` and `querytype` (`AppCode/ViewTranslation.cs:252-275`).
- Labels are read per view with `RetrieveLocLabelsRequest { EntityMoniker = savedquery/id, AttributeName = "name" | "description" }` (`ViewTranslation.cs:84-117`).
- Import reads the current labels first, merges in the workbook values, then sends `SetLocLabelsRequest { EntityMoniker, AttributeName, Labels }` with the full array (`ViewTranslation.cs:195-235`).
- `SetLocLabels` replaces the label list rather than merging it, so reading first is required.
- Charts follow the same pattern on `savedqueryvisualization` (`AppCode/VisualizationTranslation.cs:63-91, 164-171`).
- Personal views (`userquery`) are not handled.

**Forms and dashboards: high risk, do not adopt as-is**
- Form names and descriptions use the same `RetrieveLocLabels` / `SetLocLabels` pattern on `systemform` (`FormTranslation.cs:300-345`).
- Forms are queried as `systemform` where `objecttypecode = <name>` and `type IN (2, 6, 7)` (`FormTranslation.cs:985-1001`). Dashboards use `type = 0`.
- To read and write tab, section and field labels inside `formxml`, the plugin **changes the signed-in user's `usersettings`**. For each LCID it sets `uilanguageid`, `localeid` and `helplanguageid`, waits 2 seconds (`Thread.Sleep(2000)`), then reads or updates `formxml`, and restores the settings at the end (`FormTranslation.cs:34-60, 389-460`).
- This implies Dataverse returns or accepts `formxml` labels in the caller's UI language only. That is an inference from the code, not verified.
- The label XML is edited as `labels/label[@languagecode][@description]` (`FormTranslation.cs:1005-1028`). Each form is then written back with `UpdateRequest`.
- If the process crashes partway through, the user is left with the wrong UI language.

**SiteMap**
- Edits `sitemap.sitemapxml` `Titles`/`Descriptions` (attribute `LCID`), then sends `UpdateRequest` (`AppCode/SiteMapTranslation.cs:55-150, 424-599`).
- It finds sitemaps through `solutioncomponent` (`componenttype = 62`) or `appmodulecomponent`.

**Batching**
- All writes go through `ExecuteMultipleRequest` with `ContinueOnError = true` and `ReturnResponses = false` (`AppCode/BaseTranslation.cs:139-150`).
- Batch size is set by the user: **default 10, minimum 10, maximum 1000** (`MainControl.Designer.cs:750-763`, `MainControl.cs:195`).
- Failures are logged per request type with entity, column, choice or record context (`BaseTranslation.cs:56-114`).
- Success count is `requests - faulted`.
- A timeout produces the message "reduce batch size or increase timeout" (`Engine.cs:514-517`).
- There is no retry and no throttling handling.

**Publish**
- Import ends with `PublishAllXmlRequest` (`Engine.cs:570-571`). This is expensive, and Power Tools should replace it with a targeted publish.

**Privileges**
- Updating metadata needs System Customizer or System Administrator.
- The forms path also writes the caller's own `usersettings`.
- There is no explicit privilege check and no `WhoAmI` call.

**What to keep vs leave behind**

| Keep | Leave behind |
| --- | --- |
| `MergeLabels = true` on every metadata update | Changing the user's language settings and sleeping |
| Read the current labels before `SetLocLabels` | `PublishAllXml` |
| The column-exclusion rules | The EPPlus dependency |
| Skipping tables and columns that cannot be renamed | Row parsing tied to cell positions |
| `RetrieveMetadataChanges` in chunks of 100 | The WinForms progress UI |
| `ExecuteMultiple` with `ContinueOnError` and per-item fault messages | |

### Power Tools mapping

**Reuse what already exists**
- `GET /api/metadata/entities` for the table picker (the `EntityInfo` contract in `desktop/src/ui/shared/contracts/dataverse.ts`).
- `useTabConnection`, `useConnections`, `useToolStatus`, and `apiGet`/`apiPost` from `desktop/src/ui/shared/api/client.ts`.
- Shared UI from `desktop/src/ui/shared/ui`.
- The job-and-poll pattern from `/api/migration/jobs/{id}` and `/api/solution-components-mover/copies/{jobId}` for long imports.
- Solution filtering, phase 2 only: reuse the logic behind `GET /api/solution-components-mover/solutions`, but expose it under this tool's own group or promote it to a shared metadata endpoint. Do not call another tool's route from the renderer.

**New sidecar group `/api/translator`**
Location: `api/PowerTools/PowerTools.API/Tools/Translator/`, attached to `DataverseContextFilter`, using `DataverseClientFactory`. Files follow the Attribute Explorer pattern: `TranslatorEndpoints.cs`, `TranslatorService.cs`, `TranslatorClient.cs`, `TranslatorDtos.cs`, `TranslatorFaults.cs`, `TranslatorJob.cs`. Register `app.MapTranslatorEndpoints()` in `Program.cs`.

1. **`GET /api/translator/languages`**
   - Returns `{ baseLcid: int, languages: [{ lcid, name }] }`.
   - Dataverse: `organization.languagecode` plus `RetrieveProvisionedLanguagesRequest`. Names come from `CultureInfo(lcid).EnglishName` on the server.
2. **`POST /api/translator/labels/query`**
   - Body: `{ tables: string[], kinds: ("table"|"column"|"choice"|"globalChoice"|"boolean"|"relationship"|"view"|"chart")[], lcids: int[], properties: "names"|"descriptions"|"both" }`.
   - Returns `{ rows: LabelRow[] }`. A `LabelRow` is `{ key: { kind, table?, column?, optionSet?, value?, recordId?, relationship?, side?: 1|2, property: "DisplayName"|"DisplayCollectionName"|"Description"|"Label"|"name"|"description" }, labels: Record<lcid, string> }`.
   - Dataverse:
     - `RetrieveMetadataChangesRequest` in chunks of 100 with a minimal property list (tables, columns, choices, Yes/No, relationships)
     - `RetrieveAllOptionSetsRequest` (global choices)
     - `savedquery` / `savedqueryvisualization` `RetrieveMultiple` with paging, plus `RetrieveLocLabelsRequest` per record (views, charts)
   - Apply the exclusion rules above on the server.
3. **`POST /api/translator/labels/apply`**
   - Body: `{ rows: LabelRow[] (changed only), batchSize?: int (default 10, clamp 10..200) }`. Returns `{ jobId }`.
   - The job groups rows per target and sends one request per target:
     - `UpdateEntityRequest` / `UpdateAttributeRequest` / `UpdateRelationshipRequest`, starting from freshly retrieved metadata with `MergeLabels = true`
     - `UpdateOptionValueRequest` for local, global and Yes/No choices
     - `RetrieveLocLabels` then `SetLocLabels` with the merged array for views and charts
   - Requests go through `ExecuteMultipleRequest` with `ContinueOnError = true` and `ReturnResponses = false`, mapping faults by `RequestIndex`.
   - It finishes with **`PublishXmlRequest`** listing only the touched tables and global choices: `<importexportxml><entities>…</entities><optionsets>…</optionsets></importexportxml>`. Do not use `PublishAllXml`.
4. **`GET /api/translator/jobs/{jobId}`**
   - Returns `{ status, processed, total, succeeded, failed, log: [{ level, message }] }`.
5. **Phase 2:** `POST /api/translator/workbook/export` returns an `.xlsx` stream, and `POST /api/translator/workbook/parse` takes multipart upload and returns `LabelRow[]`.
   - Use **ClosedXML or DocumentFormat.OpenXml (both MIT)**. Do not use EPPlus 5 or later (Polyform Noncommercial license).
   - The renderer saves with a Blob and an `<a download>` link, and loads with `<input type="file">`. No new Electron IPC is needed.

**Desktop tool**
- id **`translator`**, title **"Translator"**, tooltip "Export, edit, and import multilingual labels for tables, columns, choices, and views", `showInActivityBar: true`, `allowMultipleInstances: true`.
- Folder `desktop/src/ui/tools/translator/`:
  - `tool.ts`, `Translator.tsx`, `translator-icon.svg`
  - `api/translatorApi.ts`, `api/queryKeys.ts`
  - `model/` (label row types, row key or diff, column filters, dirty tracking)
  - `components/` (scope picker for tables, kinds and languages; label grid with one column per LCID and the base language read-only or highlighted; apply/progress panel; job log)
  - `tests/` (fixtures, node, renderer)
- Register in `registry.tsx` and add one entry to `publicCatalog.ts`, in registry order.
- No shared contract promotion is needed; `LabelRow` stays private to the tool.

### Recommended implementation

1. **Sidecar DTOs and client.** Add `TranslatorDtos.cs` and an `ITranslatorClient` wrapper over the organization service so the service can be unit tested.
2. **Languages endpoint.** Add `GET /languages` with tests.
3. **Query endpoint, tables and columns only first.** Use chunked `RetrieveMetadataChanges` and the exclusion rules, written fresh from the behaviour described above (not copied). Test the exclusion rules, including the rollup `_state`/`_date` rule.
4. **Extend the query.** Add local, global and Yes/No choices, then relationships with `UseLabel`, then views and charts via `RetrieveLocLabels` with paged `RetrieveMultiple`.
5. **Apply job.** Use grouped requests, `MergeLabels = true`, `ExecuteMultiple` with per-index fault messages, and a targeted `PublishXml`.
   - Do not repeat the plugin's local-choice de-duplication bug.
   - Do handle multi-select choices.
   - Treat 429/service-protection errors as retryable using `Retry-After`. The plugin has no such handling.
6. **Register.** Add `MapTranslatorEndpoints` in `Program.cs`.
7. **Desktop tool module.** Build the API hooks (react-query query, mutation and polling), the model (diff of edited cells against the original, so only changed rows are sent), the scope picker, the editable label grid and the apply panel. Report progress through `useToolStatus`.
8. **Registry.** Add the tool to `registry.tsx` and `publicCatalog.ts`.
9. **Tests.**
   - Renderer: grid editing and diffing.
   - Node: model and diff logic.
   - Sidecar: exclusion rules, label merging, building the `SetLocLabels` array, fault mapping.
10. **Phase 2.** Excel workbook export and import with ClosedXML, and the solution filter.
11. **Phase 3 (optional, needs a design decision).** Form, dashboard and SiteMap labels.
    - The only approach seen in the plugin changes the user's `usersettings` UI language per LCID.
    - Before building it, the Dataverse reviewer must confirm whether `formxml` really returns only the caller's language. If it does, the feature needs an explicit opt-in, a "restore language" step in a `finally` block, and a clear warning.

**Risks and constraints**
- **GPL-3.0:** do not copy source, the WinForms layout, its exact sheet or column wording, or its icons. Matching its workbook column layout for interoperability is a format decision; flag it to the user before doing it.
- Metadata writes need customizer privileges. Surface 403s as a clear message.
- Large tables produce many `UpdateAttributeRequest` calls. Keep batches small, because metadata operations serialize on the server and time out easily.
- `SetLocLabels` replaces the whole label list, so always read before writing.

### UX

Scope is the user's first-PR cut: an in-app grid for tables, columns, local and global choices (including global Yes/No sets), Yes/No columns, relationships with a custom menu label, system views, and charts. The user views and edits labels per language and applies them with a targeted publish. Excel export and import, the solution filter, forms, dashboards, and SiteMap are not in this design.

#### Opening the tool

- **Sidebar entry.** Title `Translator`. Tooltip: "Edit table, column, choice, view, and chart labels in every installed language". It uses its own single-color SVG through `ToolIcon` (a `Languages`-style glyph drawn for Power Tools, not the plugin icon).
- **Public listing** (`publicCatalog.ts`): title `Translator`. Description: "Edit the display names and descriptions of tables, columns, choices, views, and charts side by side in every language installed in an environment."
- **Title-bar menu.** None. The tool is opened only from the sidebar and the command palette.
- **Multiple tabs.** `allowMultipleInstances: true`. Each tab keeps its own scope selection, component tab, language choice, filter, sort, and unsaved edits, and follows the selected environment. Two tabs can edit different tables of the same environment.

#### Layout

A horizontal split built from `Group`, `Panel`, and `Separator` (`react-resizable-panels`), as in `Layout.tsx`.

- Left panel, **scope list**: default `260px`, `minSize` `200px`, `maxSize` `40%`.
- `Separator` with `aria-label="Resize panes"`, classes `w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent`.
- Right panel, **label grid**: `minSize` `50%`.

A `Toolbar` runs across the top of the whole tab, above the split:

- Start: `Select` labeled "Show" with `Names and descriptions` (default), `Names only`, `Descriptions only`. "Names" covers display name, plural name, option label, True label, False label, view name, chart name, and relationship menu label.
- Start: `Button` (secondary, `sm`) "Languages…" with the count, for example `Languages (4 of 6)`. It opens the language `Modal` below.
- End: `Button` (ghost, `sm`) "Discard changes", disabled with no edits.
- End: `Button` (primary) "Apply changes" with the count, for example `Apply 12 changes`, disabled with no edits or while any edited cell is invalid.
- End: `Button` (ghost, icon `RotateCw`, `aria-label="Reload labels"`) with a `Tooltip`. It reloads languages, the table list, and the current grid. With unsaved edits it first asks in a `Modal`: "Reloading discards 12 unsaved changes." with **Discard and reload** (danger) and **Cancel**.

#### Scope list (left)

- First row, fixed above the search: **Global choices**, with the number of global choice sets in muted text. It is selectable like a table row.
- `SearchInput`, placeholder "Search tables by display or logical name". Autofocused when the tab opens with a connection.
- One row per table: display name in `text-fg`, logical name below in `font-mono text-2xs text-fg-muted`. Selected row `bg-accent-soft text-fg-strong`; hover `hover:bg-hover`. Arrow keys move the selection while the list has focus.
- A table or Global choices row that holds unsaved edits shows a `Badge` (`tone="accent"`) with the count, for example `3 edited`, so edits made elsewhere stay visible.
- Header above the list: "Tables" and the count, `812` or `24 of 812` while filtering.

#### Label grid (right)

- **Nothing selected:** `EmptyState`, "Select a table or Global choices to see its labels."
- **Header:** the table display name (`text-base font-semibold text-fg-strong`) and logical name (mono, muted), or "Global choices".
- **Component tabs** (`Tabs`, only for a table): `Table`, `Columns`, `Choices`, `Yes/No`, `Relationships`, `Views`, `Charts`. Each tab label shows an edit count in a `Badge` when that tab holds unsaved edits. The selected tab is kept when the user moves to another table. Global choices has no tabs.
- **Grid filter:** `SearchInput`, placeholder "Filter by name or any label". It matches the component's display name, logical name, and every visible language value. It is kept across component tabs and cleared when the scope changes.
- **Grid:** one `DataTable` per tab. Headers are title case as written here. Every column is sortable by clicking its header: first click ascending (↑), same header again descending (↓). Sorting uses the loaded values, not drafts, so rows do not jump while the user types. Default sort is `Component` ascending, then `Label` in the order listed below. The grid sits in a `min-h-0 flex-1` parent and scrolls on both axes inside the pane; the page itself never scrolls horizontally. Language columns have a fixed width (about `220px`).

  | Tab | Identifying columns | `Label` values |
  | --- | --- | --- |
  | Table | `Component` (the table) | Display Name, Plural Name, Description |
  | Columns | `Component` (column display name, logical name below in mono muted) | Display Name, Description |
  | Choices | `Component` (the choice column), `Value` | Option Label, Option Description |
  | Yes/No | `Component` (the Yes/No column) | True Label, False Label |
  | Relationships | `Component` (schema name), `Type` (`1:N` or `N:N`) | Menu Label |
  | Views | `Component` (view name in the base language) | Name, Description |
  | Charts | `Component` (chart name in the base language) | Name, Description |
  | Global choices | `Component` (choice set, logical name below), `Value` (empty for set-level rows) | Display Name, Description, Option Label, Option Description; global Yes/No sets add True Label, False Label |

  After these come one column per shown language, base language first, then by language name. Header: `English (1033)`; the base language header adds a `Badge` `Base`. The "Show" select hides or shows rows by `Label` kind.

- **Editing a cell.** Each language cell renders an `Input` (compact, `className` only for layout) bound to the tab's draft store keyed by row key plus LCID, so drafts survive virtualization, sorting, filtering, tab switches, and scope switches. Long values are shown truncated with the full text in `title`.
  - An edited cell gets `bg-accent-soft`. Restoring the original text removes the draft.
  - Clearing a base-language Display Name, Plural Name, Name, or Option Label marks the cell invalid: `border-danger`, `aria-invalid`, and a `Tooltip` "The base language label is required." Apply stays disabled while any cell is invalid. Clearing a non-base value is allowed and means "remove this translation"; the Dataverse review section decides whether that write is possible, and if not, the cell is invalid with its message.
  - A component the Dataverse review marks as not editable (for example not customizable) renders its cells as plain `text-fg-muted` text with a `Tooltip` stating why. The row stays visible.
  - Empty translations render an empty `Input` with placeholder `—` in `text-fg-muted`.
- **Grid states:**
  - Loading: centered `Spinner` with "Loading column labels…" (the tab's noun).
  - Empty tab: `EmptyState`, for example "This table has no Yes/No columns." For Relationships: "No relationships on this table use a custom menu label."
  - No filter match: `DataTable` `emptyMessage` `No labels match "{query}".`
  - Error: `Alert` (`tone="danger"`) with the message and a **Retry** `Button`, plus an error toast. Other tabs and drafts are unaffected.

#### Languages modal

`Modal` titled "Languages". One `Checkbox` per provisioned language, `English (1033)` format. The base language is checked and disabled with the note "The base language is always shown." Quick actions as ghost `Button`s: **All languages**, **Base language only**. Default when the tab opens: all provisioned languages. Hiding a language that holds drafts keeps the drafts and they are still applied; the toolbar count still includes them. **Done** (primary) closes it.

#### Apply flow

1. **Apply changes** opens a `Modal` titled "Apply label changes". It lists counts by scope: one line per table or Global choices, for example `account: 7 labels`, `Global choices: 2 labels`, and the total. Text: "Only the tables and global choices listed here are published." Buttons: **Apply and publish** (primary), **Cancel**.
2. While running the modal is `busy` and cannot close. It shows a `ProgressBar` with "Updating labels: 8 of 12", then "Publishing 3 components…".
3. **All succeed:** the modal closes, drafts clear, the grid shows the new values, and a success toast says "Updated 12 labels and published 3 components."
4. **Some fail:** the modal stays open and shows an `Alert` (`tone="warn"`) "10 of 12 labels updated. 2 failed." and a `DataTable` with columns `Component`, `Label`, `Language`, `Error`. Successful drafts clear; failed drafts stay in the grid with `bg-danger-soft` and a `Tooltip` holding the error. Publish still runs for the components that changed. **Close** returns to the grid.
5. **Publish fails:** `Alert` (`tone="danger"`) "Labels were saved but publishing failed: {message}" with **Retry publish** (primary) and **Close**. Saved values are kept; drafts are cleared for them.

**Discard changes** asks in a `Modal`: "Discard 12 unsaved label changes?" with **Discard** (danger) and **Cancel**.

#### Connection and status

- **No connection:** `EmptyState` across the tab, "Right-click this tab and choose Change connection."
- **Connection change:** reset scope, tabs, filters, language choice, and drafts. If drafts existed, show an info toast "Discarded 12 unsaved label changes from the previous environment."
- **First load:** a centered `Spinner` with "Loading languages and tables…" in the left pane; the right pane shows its empty state. On failure, an `Alert` (`tone="danger"`) with **Retry** in the left pane, plus an error toast.
- **Status bar** (`useToolStatus`): "No environment selected", "Loading languages and tables…", "812 tables, 6 languages", "Loading column labels for account…", "account: 143 columns", "12 unsaved changes", "Updating labels: 8 of 12", "Publishing…", "Could not load …".

#### Shared controls

`Toolbar`, `Button`, `Select`, `Input`, `SearchInput`, `Tabs`, `DataTable`, `Checkbox`, `Modal`, `Badge`, `Alert`, `EmptyState`, `Tooltip`, `ProgressBar`, `Spinner`, `useToast`, plus the `react-resizable-panels` split. Icons from `lucide-react` (`RotateCw`). Colors only from the token classes in `ui-colors`; no new tokens are needed.

#### Do not build

- Excel export or import, a workbook preview, or a batch-size setting (later phase, own workbook layout).
- The solution filter (later phase).
- Forms, dashboards, and SiteMap labels.
- Publish All. Publishing is only for the changed tables and global choices.
- Machine translation, translation suggestions, copy-from-language, or fill-down.
- A "missing translations only" filter, language provisioning, or changing the base language.
- Editing anything other than labels (names, required level, option values, adding or removing options).
- Comparing environments.
- Easy Translator's WinForms layout: the entity checklist with Export and Import buttons, the language radio group, the log pane, and its icons and wording.

### Open questions

Answered by the user before Dataverse review and UX:

- **License (GPL-3.0 source):** build Translator as a clean-room reimplementation. Use Easy Translator only as a behavioral reference. Copy no code, UI layout, icons, or wording.
- **Scope of the first pull request:** the in-app grid only. It covers tables, columns, local and global choices, Yes/No, relationships, views, and charts. The user views and edits labels per language in a grid and applies them with a targeted publish. Excel export and import and the solution filter are later work. Forms, dashboards, and SiteMap are out of scope.
- **Excel format (later phase):** use our own workbook layout. Do not match Easy Translator's layout.
