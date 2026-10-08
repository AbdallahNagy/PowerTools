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

### Dataverse review

Evidence used: Microsoft's SDK message contracts for the requests named below (`Microsoft.Xrm.Sdk.Messages` and `Microsoft.Crm.Sdk.Messages`), the Dataverse metadata and service-protection documentation as I know it, and this repo's sidecar code (`Services/DataverseClientFactory.cs`, `PowerTools.API.csproj`, and the `Retry-After` handling in `Tools/SolutionComponentsMover` and `Tools/WorkflowActivities`). I did not run anything against a live environment. Items marked **unverified** need a check on a dev environment before the developer depends on them. Scope follows the user's answer: tables, columns, local and global choices, Yes/No, relationships, views and charts in an in-app grid. Forms, dashboards and SiteMap are out of scope, so this review does not confirm or reject the plugin's `usersettings` approach.

**Corrections to messages**
- **State (`statecode`) labels use `UpdateStateValueRequest`, not `UpdateOptionValueRequest`.** The contract is `UpdateStateValueRequest { EntityLogicalName, AttributeLogicalName, Value, Label, Description, MergeLabels }`. Microsoft documents `UpdateOptionValue` for Picklist, Status, multi-select and Boolean, and a separate message for state options. The plugin sends `UpdateOptionValue` for State. Treat that as wrong per the contract.
- **Status (`statuscode`), local Picklist, local multi-select and local Yes/No** use `UpdateOptionValueRequest` with `EntityLogicalName` + `AttributeLogicalName` + `Value`. Multi-select works the same way as Picklist, so the plugin's "Unable to determine type" gap is a plugin bug, not a platform limit.
- **Global choices and global Yes/No sets** use `UpdateOptionValueRequest` with `OptionSetName` + `Value` and no entity or attribute. The 0 = false, 1 = true mapping is correct.
- **Detect global versus local from `OptionSet.IsGlobal`** on the column metadata, not from `OptionSetName` being null. `OptionSetName` on the request is an input, and the plugin's de-duplication on it is a plugin bug. Send one request per option that carries both `Label` and `Description` when both changed.
- **Tables, columns, relationships:** `UpdateEntityRequest`, `UpdateAttributeRequest` and `UpdateRelationshipRequest` all have `MergeLabels`. With `MergeLabels = true`, languages you leave out of a `Label` are kept. Keep it on every call.
- **Read-before-write must use the unpublished layer.** `RetrieveEntityRequest`, `RetrieveAttributeRequest`, `RetrieveRelationshipRequest` and `RetrieveOptionSetRequest` all take `RetrieveAsIfPublished = true`. Use it on the fresh read in the apply job. Without it, the job writes back published values over another maker's unpublished edits to the same component.
- **Full object versus a minimal object.** The mapping says to send back freshly retrieved metadata. That is Microsoft's documented pattern, and it is the safe default. Keep the derived type (for example `PicklistAttributeMetadata`), and change only `DisplayName`, `DisplayCollectionName` and `Description`. The plugin sends a minimal `EntityMetadata` for tables. That works in practice, but whether null properties always mean "unchanged" is **unverified** for every metadata type, so do not rely on it.
- **For one table with many changed columns, use a single `RetrieveEntityRequest(EntityFilters.Attributes, RetrieveAsIfPublished = true)`.** Do not send one `RetrieveAttributeRequest` per column. Use `EntityFilters.Relationships` only when relationships changed.
- **Views and charts:** `RetrieveLocLabelsRequest` has `IncludeUnpublished`. Set it to true for the read-before-write. `SetLocLabelsRequest { EntityMoniker, AttributeName, Labels }` is the right message for `savedquery` and `savedqueryvisualization` `name` and `description`. Whether `SetLocLabels` drops languages that are left out of `Labels` is **unverified** (the plugin assumes it does). Reading and merging first is correct either way, so keep it.
- **Plain `RetrieveMultiple` on `savedquery.name` returns the caller's UI language only.** That is why `RetrieveLocLabels` is needed. Do not show the `name` column from `RetrieveMultiple` as the base-language label.

**Corrections to metadata reads**
- **Use `LabelQueryExpression` on `RetrieveMetadataChangesRequest`.** Set `FilterLanguages` to the selected LCIDs. Without it, every provisioned language is returned. That is correct but heavier.
- `RetrieveMetadataChanges` returns **published** metadata only, with no `RetrieveAsIfPublished`. The grid therefore shows published labels. This is acceptable, but the apply job must re-read with `RetrieveAsIfPublished = true` (above). The UI should not imply that the grid includes unpublished edits.
- Filter tables with a `LogicalName` `In` condition (`MetadataConditionOperator.In`) rather than OR-ing `MetadataId` conditions. Chunks of 100 are a plugin choice, not a documented limit. Keep 100 as a cautious default.
- Property lists needed: tables need `LogicalName`, `SchemaName`, `DisplayName`, `DisplayCollectionName`, `Description`, `IsRenameable`, `IsCustomizable`, `IsManaged`. Columns need `LogicalName`, `AttributeType`, `AttributeTypeName`, `AttributeOf`, `DisplayName`, `Description`, `IsRenameable`, `IsCustomizable`, `IsManaged`, `OptionSet`. Relationships need `SchemaName`, `AssociatedMenuConfiguration` (1:N) or `Entity1AssociatedMenuConfiguration`/`Entity2AssociatedMenuConfiguration` (N:N), `Entity1LogicalName`/`Entity2LogicalName` or `ReferencedEntity`/`ReferencingEntity`, and `IsCustomizable`. `OptionSet` returns `Options`, `TrueOption`/`FalseOption` or `StateOptionMetadata` as the column type requires.
- **Editability rules, beyond the plugin's:**
  - `IsRenameable` (a `BooleanManagedProperty`, so read `.Value`) controls `DisplayName` and `DisplayCollectionName`.
  - `IsCustomizable.Value` controls whether the component can be updated at all.
  - The plugin skips a whole table when `IsRenameable` is false, and it never checks `IsCustomizable`. Recommended: hide components where `IsCustomizable.Value` is false, and make name cells read-only where `IsRenameable.Value` is false. Whether `Description` stays editable when only `IsRenameable` is false is **unverified**. Until it is checked, make the whole row read-only in that case.
  - Global choices: check `IsCustomizable` on the option set.
  - Views: query the `iscustomizable` managed property on `savedquery` and `savedqueryvisualization`, and make non-customizable rows read-only.
- The column exclusion list (types, `AttributeOf`, the Virtual exception for multi-select, the rollup `_state` and `_date` helpers) is a reasonable heuristic. It is not a Microsoft rule. Keep it as a filter, and do not report excluded columns as errors.
- **Views query:** filter `savedquery` by `returnedtypecode` with an `In` on the selected logical names. Use `PagingInfo`/paging cookie even though counts are usually small, and do not use the plugin's per-table query. Exclude private views (`isprivate = true`). Whether some `querytype` values (for example internal or offline views) should also be hidden is **unverified**. Show them, and label the type. Charts filter `savedqueryvisualization` by `primaryentitytypecode`.
- **Batch the per-view reads.** `RetrieveLocLabels` once per view is N+1. It can be sent inside `ExecuteMultipleRequest` with `ReturnResponses = true`, which saves round trips.

**Languages endpoint**
- `organization.languagecode` plus `RetrieveProvisionedLanguagesRequest` is correct. The response normally includes the base language. Union and de-duplicate anyway.
- **Correction to the mapping:** `PowerTools.API.csproj` sets `<InvariantGlobalization>true</InvariantGlobalization>`. Under that setting `new CultureInfo(lcid)` throws `CultureNotFoundException`, so `CultureInfo(lcid).EnglishName` will not work.
  - Instead, read the `languagelocale` table (`localeid`, `name`, `language`, `code`) filtered to the provisioned LCIDs.
  - Fall back to `LCID <n>` when no name is found.
  - Do not turn off invariant globalization for this.
  - Whether `languagelocale` exists on on-premises is **unverified**. The fallback covers that case.
- Validate on the server that every LCID in a write is provisioned. Reject the row before Dataverse sees it.

**Batching, transactions and throttling**
- `ExecuteMultipleRequest` is not a transaction. With `ContinueOnError = true` and `ReturnResponses = false`, `Responses` holds only the faulted items, keyed by `RequestIndex`. The mapping has that right. The documented maximum is 1000 requests per batch, and `ExecuteMultiple` cannot be nested.
- Metadata writes are slow and take a customization lock, so a batch of 200 `UpdateAttribute` calls can run past the client timeout.
  - Keep the default of 10.
  - Cap metadata-update batches at about 50, below the proposed 200. 50 is a judgment, not a documented limit.
  - `UpdateOptionValue` and `SetLocLabels` are lighter, but use the same cap for simplicity.
- Service protection (online only):
  - `ServiceClient` already retries 429 and service-protection faults and honors `Retry-After` (its `MaxRetryCount` and `RetryPauseTime` settings).
  - Do not add a second retry loop around it. Reuse the repo's existing `ReadRetryAfter` handling only to report a fault that is still there after the built-in retries, or to resume the job.
  - Label updates with `MergeLabels = true` and `SetLocLabels` with a full merged array are idempotent, so a retry is safe.
- **Customization lock (online and on-premises).** Dataverse runs one customization operation at a time per org. A metadata update during another publish or a solution import fails with a "another operation is running / try again later" style fault (**the exact error code is unverified**).
  - Treat that fault as retryable with backoff.
  - **Serialize apply jobs per environment in the sidecar.** `allowMultipleInstances: true` means two tabs on the same environment would otherwise fight over the lock.
- On-premises: there are no service-protection limits by default. `ExecuteMultiple` batch size and concurrency are server settings (defaults 1000 and 2).

**Publish**
- `PublishXmlRequest` with only the affected components is correct. Format: `<importexportxml><entities><entity>account</entity>…</entities><optionsets><optionset>new_color</optionset>…</optionsets></importexportxml>`.
- Which tables to include:
  - Tables and columns, local choices, Yes/No and status/state: the table that owns them.
  - Global choices: the option set name.
  - 1:N relationships: both the referenced and the referencing table.
  - N:N relationships: both tables.
  - Views and charts: their table (`savedquery` and `savedqueryvisualization` publish with the entity).
- **Side effect to show in the UI:** publishing a table publishes **all** of its pending unpublished customizations, including other makers' form or view edits, not only these labels.
- Publish only targets with at least one successful write. Run publish even when some rows failed.
- If publish fails, the labels are saved but unpublished. Report that as a separate state, and offer "publish again". Publishing again is safe.
- A publish already running elsewhere causes the lock fault above. Retry it.

**Privileges and connection**
- The work runs under the signed-in user's delegated token (`ExternalTokenManagement`). No impersonation and no `CallerId` are needed or wanted.
- A role is not the requirement. The user needs Write privileges on the metadata types touched, plus Publish Customizations. System Customizer and System Administrator have all of them.
  - Recommended check: `WhoAmI`, then `RetrieveUserPrivilegesRequest`, mapped to names through the `privilege` table. Disable Apply with a clear message when privileges are missing, and show the grid read-only.
  - Exact privilege names to check are **unverified** and should be confirmed against the `privilege` table. Likely candidates: `prvWriteEntity`, `prvWriteAttribute`, `prvWriteOptionSet`, `prvWriteRelationship`, `prvWriteQuery` (`savedquery`), the `savedqueryvisualization` write privilege, and `prvPublishCustomizations`.
  - Still map a privilege fault on any single request to a clear per-row message, because privileges can change during a job.
- Reading needs only Read on the metadata types, which almost every role has.

**Online versus on-premises**
- Online uses `ServiceClient`. On-premises uses the vendored Data8 `OnPremiseClient` (SOAP, `IOrganizationServiceAsync2`).
- All the messages above exist in the v9 on-premises SDK. That the Data8 client serializes metadata request types (`UpdateEntity`, `UpdateAttribute` with derived metadata types, `UpdateRelationship`, `RetrieveMetadataChanges` with `EntityQueryExpression`) is **unverified**. The repo's existing tools mostly send data messages. Add one on-premises smoke test per message family before claiming on-premises support. If any family fails there, disable that kind on on-premises rather than the whole tool.
- `OnPremiseClient` has no built-in 429 retry. On-premises normally has no 429s, so only the customization-lock retry matters there.
- Language packs on-premises are installed per server. `RetrieveProvisionedLanguages` reflects what is provisioned in the org, which is the right source.

**Solution and managed limits**
- Label edits on managed components are allowed when the component is customizable or renameable (above). They go into the unmanaged active layer and override the managed labels for those languages. A later managed upgrade does not remove that override. Removing the active layer reverts it.
- The writes are not added to any specific solution, so they land in the default solution. `UpdateEntityRequest`, `UpdateAttributeRequest`, `UpdateRelationshipRequest`, `UpdateOptionValueRequest` and `UpdateStateValueRequest` all accept `SolutionUniqueName`. That is a natural later addition alongside the solution filter. `SetLocLabelsRequest` has no such parameter. Out of scope for the first pull request.
- Labels for a language that is later deprovisioned stay in metadata but are not shown. Nothing to handle in v1.

**Validation and failure modes**
- An empty base-language `DisplayName`, `DisplayCollectionName` or option `Label` is rejected by Dataverse. Block it in the grid and on the server.
- Clearing a non-base translation by sending an empty string with `MergeLabels = true` has **unverified** behavior: the label may be ignored, removed, or stored as empty. Until that is tested, do not offer "clear translation" in v1, or test it and document the result in the implementation notes.
- If a component was deleted or renamed between query and apply, the fresh read fails with "does not exist". Report that row as skipped and continue.
- Partial success is normal. The job result must list succeeded, failed and skipped rows separately, with the target named, and publish whatever succeeded.
- A timeout on an `ExecuteMultiple` leaves an unknown subset applied. Because the writes are idempotent, the job can re-send that batch once with a smaller size before reporting failure.

**Plugin claims that are wrong**
- It sends `UpdateOptionValue` for State options. Use `UpdateStateValue`.
- Its de-duplication of local choices uses `OptionSetName`, so the label and the description of the same option go out as two requests (already noted by research, and confirmed as a bug).
- It does not match multi-select choices on import. The platform supports them through `UpdateOptionValue`.
- It does not check `IsCustomizable`, and it treats `IsRenameable` as table-wide.
- `PublishAllXml` is unnecessary. Targeted `PublishXml` is supported.
- Its `solutioncomponent` query has no paging (research noted this; the solution filter is later work).

**Plugin claims that remain unverified**
- That `SetLocLabels` drops languages left out of `Labels`. The read-merge-write approach makes this moot.
- That a minimal `EntityMetadata` or `AttributeMetadata` leaves unset properties unchanged.
- How an empty string behaves under `MergeLabels`.
- That `formxml` labels are returned only in the caller's UI language. This is out of scope and was not reviewed.
- The batch range of 10 to 1000 the plugin allows. The 1000 maximum is the documented `ExecuteMultiple` ceiling, but it is not safe for metadata writes.

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

### Implementation notes and test evidence

Scope follows the user's first-PR decision: an in-app grid for tables, columns, local choices, Yes/No columns, relationships with a custom menu label, system views, charts, and global choices (including global Yes/No sets), applied with a targeted publish. There is no Excel export or import, no solution filter, no forms, dashboards, or SiteMap, no batch-size setting, and no Publish All. Easy Translator was used only as a behavioral reference. No code, layout, wording, or icons were copied, and no new dependency was added.

**Sidecar: `api/PowerTools/PowerTools.API/Tools/Translator/`**
- `TranslatorEndpoints.cs` maps the `/api/translator` group behind `DataverseContextFilter`. It is registered with `app.MapTranslatorEndpoints()` in `Program.cs`, together with `ITranslatorJobStore`, `ITranslatorDelay`, and the `TranslatorJobRunner` hosted service.
  - `GET /languages` returns `{ baseLcid, languages: [{ lcid, name }] }`. It reads `organization.languagecode` and `RetrieveProvisionedLanguagesRequest`, unions and de-duplicates them, and gets names from `languagelocale`. If that read fails, the name falls back to `LCID <n>`. `CultureInfo` is not used, because the project sets `InvariantGlobalization`.
  - `POST /labels/query` returns `{ rows: LabelRow[] }`. Body: `{ tables, kinds, lcids, properties }`.
  - `POST /labels/apply` validates the rows and queues a job. It returns `{ jobId }`.
  - `GET /jobs/{jobId}` returns `{ status, phase, processed, total, succeeded, failed, skipped, results, publish, log }`.
  - `POST /publish` takes `{ tables, optionSets }`. It was added for the UX's **Retry publish** button, and it publishes only the targets it is given.
- `TranslatorClient.cs` holds the `ITranslatorClient` seam, the Dataverse implementation over `DataverseClientFactory`, and pure request builders.
- `TranslatorMapper.cs` turns metadata into rows and applies the exclusion and editability rules.
- `TranslatorService.cs` covers languages, the query, apply validation, and publish.
- `TranslatorApply.cs` plans and runs the writes.
- `TranslatorJob.cs` holds the job, the in-memory store, and the runner.
- `TranslatorFaults.cs` and `TranslatorDtos.cs` hold the fault mapping and the contracts.

**Query behavior, including the Dataverse review corrections**
- Tables, columns, choices, Yes/No columns, and relationships are read with `RetrieveMetadataChangesRequest`.
  - The query uses a `LogicalName` `In` condition, in chunks of 100 tables.
  - It sends minimal property lists for tables, attributes, and relationships.
  - `LabelQueryExpression.FilterLanguages` is set to the requested LCIDs.
- Global choices are read with `RetrieveAllOptionSetsRequest`.
- Views are read with a paged `savedquery` query: `returnedtypecode` `In` the tables and `isprivate = false`. Charts are read with a paged `savedqueryvisualization` query on `primaryentitytypecode`. Names and descriptions come from `RetrieveLocLabelsRequest`, batched through `ExecuteMultipleRequest` with `ReturnResponses = true`. The `name` column from `RetrieveMultiple` is not used. Each view shows its type (for example "Public view").
- The column exclusions are applied as a heuristic, not reported as errors:
  - columns with `AttributeOf` set
  - the types BigInt, CalendarRules, EntityName, ManagedProperty, and Uniqueidentifier
  - Virtual columns, except multi-select choices
  - columns whose labels are all empty
  - rollup `_state` and `_date` helpers when the base column exists
- Choices cover Picklist, State, Status, and multi-select columns. A column is local or global according to `OptionSet.IsGlobal`.
- Relationships are included only when their menu behavior is `UseLabel`. A 1:N shows on its referenced table, and an N:N shows once per side (`side` 1 or 2).
- Editability:
  - When `IsCustomizable.Value` is false (tables, columns, relationships, global choices, and the `iscustomizable` flag on views and charts), the row is shown read-only with the reason.
  - When `IsRenameable.Value` is false, the whole row is read-only, as the review requires until the description case is verified.
  - This follows the UX ("the row stays visible") rather than the review's "hide" suggestion, so every component in the table is still visible.
- The grid shows published labels. The UI does not claim that it includes unpublished edits.

**Apply behavior**
- Validation on the server happens before Dataverse is called:
  - A malformed key returns 400.
  - An LCID that is not provisioned fails that label.
  - Any empty value fails that label. An empty base-language name gets "The base language label is required." An empty translation is refused: because the effect of an empty label under `MergeLabels` is unverified, clearing a translation is not offered in v1.
  - The batch size defaults to 10 and is clamped to 10..50.
- Every write starts from a fresh read with `RetrieveAsIfPublished = true`, changes only labels, and sets `MergeLabels = true`.
  - Each table gets one `RetrieveEntityRequest`: `Entity` for table labels, and `Attributes` and/or `Relationships` for the rest.
  - Tables use `UpdateEntityRequest`. Columns use `UpdateAttributeRequest`, keeping the derived metadata type. Relationships use `UpdateRelationshipRequest`, editing `AssociatedMenuConfiguration` or `Entity1`/`Entity2AssociatedMenuConfiguration`.
  - State options use **`UpdateStateValueRequest`**.
  - Status, Picklist, multi-select, and Yes/No options use `UpdateOptionValueRequest` with entity and attribute. Each option is one request that carries both its label and its description, which fixes the plugin's de-duplication bug.
  - Global choices: set names use `RetrieveOptionSetRequest(RetrieveAsIfPublished)` followed by `UpdateOptionSetRequest`. Options use `UpdateOptionValueRequest` with `OptionSetName` (for Yes/No sets, 0 = false and 1 = true).
  - Views and charts read the current labels with `RetrieveLocLabels(IncludeUnpublished = true)`, then send `SetLocLabelsRequest` with the full merged list.
- Writes go through `ExecuteMultipleRequest` with `ContinueOnError = true` and `ReturnResponses = false`. Faults are mapped back to their rows by `RequestIndex`.
  - A "does not exist" fault, or a component missing from the fresh read, is reported as **skipped**. Privilege faults get a clear per-row message.
  - Customization-lock faults (matched by wording, since the code is unverified) are retried up to 3 times with backoff, for single items, whole batches, and publish.
  - A timed-out batch is re-sent once in halves.
  - No second 429 retry loop was added: `ServiceClient` already retries those.
- Publish uses `PublishXmlRequest` with only the touched tables and global choices:
  - the owning table of each label
  - both tables of a relationship
  - the table of each view or chart
  - the name of each global option set
- Publish runs even when some rows failed, and a publish failure is reported separately. Apply jobs run one at a time in a single background runner, so two tabs on the same environment do not compete for the customization lock.

**Desktop: `desktop/src/ui/tools/translator/`**
- The tool lives in `tool.ts`: id `translator`, title `Translator`, the tooltip from the UX, `allowMultipleInstances: true`, and its own `translator-icon.svg`.
- The UI is built from `Translator.tsx`, `state/useTranslator.ts`, `api/translatorApi.ts` and `api/queryKeys.ts`, the `model/` files (`labels`, `drafts`, `grid`, `types`, `apiError`), and the `components/` files (`ScopeList`, `LabelGrid`, `LabelCell`, `LanguagesModal`, `ApplyModal`, `ConfirmModal`).
- It is registered in `registry.tsx` and `publicCatalog.ts` (after Solution Components Mover, in registry order) with the UX's public-listing sentence. `test/toolRegistry.test.ts` was updated for the new order.
- The table list reuses `GET /api/metadata/entities`. All calls go through `shared/api/client.ts` with `meta.connectionName`.
- Implemented UX behavior:
  - Toolbar: the "Show" select, "Languages (n of m)", "Discard changes", "Apply n changes", and a reload icon that asks before discarding drafts.
  - Resizable split: 260px scope list with a minimum of 200px and a maximum of 40%; grid with a minimum of 50%.
  - Scope list: a Global choices row with its count, autofocused search, arrow-key selection, and "n edited" badges.
  - Component tabs carry edit-count badges. The filter is kept across tabs and cleared when the scope changes.
  - Every column sorts on loaded values. The default order is Component, then Value, then Label.
  - There is one fixed-width column per language, base language first with a `Base` badge.
  - The draft store is keyed by row key and LCID, so drafts survive tab, scope, filter, and sort changes and hiding a language. Edited cells use `bg-accent-soft`. Invalid cells get `border-danger`, `aria-invalid`, and a tooltip, and they disable Apply. Failed cells use `bg-danger-soft` with the error in a tooltip. Read-only rows show muted text with the reason.
  - Languages modal: the base language is locked; quick actions are All languages and Base language only.
  - Apply modal:
    - It confirms the change count per scope and blocks closing while it runs, showing progress.
    - On success, it shows a toast and patches the saved values into the cached grid.
    - On partial failure, it shows a warning and a `Component / Label / Language / Error` table, and failed drafts stay in the grid.
    - If publish fails, it shows an alert with **Retry publish**.
  - Status-bar texts follow the UX. When the connection changes, everything resets, with an info toast if drafts were discarded.
- One shared change: `desktop/src/ui/shared/ui/Tooltip.tsx` gained an optional `disabled` prop. It keeps the element tree the same, so a cell's input keeps focus when the cell becomes invalid while the user types.

**Tests (fake Dataverse surfaces only; no credentials or live environment)**
- Sidecar: `api/PowerTools/PowerTools.API.Translator.Tests/` (added to `PowerTools.sln`) has 25 xUnit tests over a recording `FakeTranslatorClient`. They cover:
  - languages: union, ordering, and the fallback name
  - query validation, chunks of 100 with a `LogicalName In` condition, and `FilterLanguages`
  - the read-only reasons and every column exclusion rule, including the rollup `_state`/`_date` rule
  - local choices: Picklist, State, Status, and multi-select, but not global choices
  - Yes/No columns, relationships with `UseLabel` only (1:N and N:N sides), and global choices and Yes/No sets
  - views: `RetrieveLocLabels`, the private-view exclusion, and the view type
  - apply validation and batch clamping
  - `MergeLabels` and label merging on fresh metadata, with one attribute read per table
  - `UpdateStateValue` for State, and one combined label-plus-description request per option
  - global choice writes and their publish XML, and relationship publish targets on both tables
  - the read-merge-write `SetLocLabels` array, fault mapping by request index (privilege fault and skipped component), and the customization-lock retry
  - resending a timed-out batch in halves, publish failure reporting, and Retry publish
- Desktop: node tests in `tests/node/` (`labels`, `drafts`, `grid`) and an MSW renderer test in `tests/renderer/translator.test.tsx` (10 tests). The renderer tests cover:
  - no connection, the first load, column headers, the query body, and the status bar
  - draft tracking and badges, and blocking an empty base name
  - drafts across tabs, and read-only rows
  - the filter, the Show select, and the languages modal
  - a successful apply with its toast and saved value
  - a partial failure, a publish failure, and Retry publish
  - the discard and reload confirmations, global choices, and the grid error with Retry

**Commands run, all passing**
- From `desktop/`:
  - `npm test`: 81 files, 442 tests passed.
  - `npm run lint`: clean.
  - `npm run build`: succeeded.
  - `xvfb-run -a npm run check`: typecheck, lint with `--max-warnings 0`, 442 tests, the renderer build, and the Playwright smoke test (1 passed).
- From `api/PowerTools/`:
  - `dotnet build PowerTools.sln`: 0 warnings, 0 errors.
  - `dotnet test PowerTools.sln`: all projects passed, including Translator (25).

**Limits of this verification**
- The container has no .NET 9 runtime. It could not be downloaded here, because `builds.dotnet.microsoft.com` was blocked by the egress policy. The sidecar was built with the .NET 10 SDK from the Microsoft apt feed, and the `net9.0` tests ran with `DOTNET_ROLL_FORWARD=Major`. CI runs on .NET 9.
- Nothing ran against a live or on-premises environment. These points stay unverified, as the Dataverse review notes:
  - whether the Data8 on-premises client serializes the metadata messages
  - the exact customization-lock error code (it is matched by wording)
  - whether the `languagelocale` table exists on on-premises
- The privilege pre-check that the review recommends (`WhoAmI` plus `RetrieveUserPrivileges`) is not implemented, because the privilege names are unverified. Privilege faults are mapped per row instead.

### Open questions

Answered by the user before Dataverse review and UX:

- **License (GPL-3.0 source):** build Translator as a clean-room reimplementation. Use Easy Translator only as a behavioral reference. Copy no code, UI layout, icons, or wording.
- **Scope of the first pull request:** the in-app grid only. It covers tables, columns, local and global choices, Yes/No, relationships, views, and charts. The user views and edits labels per language in a grid and applies them with a targeted publish. Excel export and import and the solution filter are later work. Forms, dashboards, and SiteMap are out of scope.
- **Excel format (later phase):** use our own workbook layout. Do not match Easy Translator's layout.
