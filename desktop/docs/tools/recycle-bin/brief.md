# Recycle Bin: XrmToolBox research brief

## Summary
- **Match:** a high-confidence open-source match (the BDK Recycle Bin plugin).
- **License:** MIT, so reuse is allowed with credit.
- **Blockers:** none. www.xrmtoolbox.com and learn.microsoft.com did not resolve from this sandbox (DNS error). I took the catalog metadata from NuGet instead, and Microsoft's docs from the MicrosoftDocs GitHub repos.
- **Overlap:** no existing Power Tools tool covers this job.
- **Key finding:** the plugin predates Dataverse's own recycle bin (deleted record keeping, with `datasource='bin'` queries and the `Restore` message). That native feature is the better restore path. The plugin's audit-log approach should be the fallback.

---

### Match

- **Plugin:** Recycle Bin
  - Catalog: https://www.xrmtoolbox.com/plugins/BDK.XrmToolBox.RecycleBin/
  - NuGet id: `BDK.XrmToolBox.RecycleBin`
  - Latest version: 1.2023.11. Earlier versions: 1.2016.11.1 through 1.2019.7.1.
- **Author:** Deepak Battini (Tech Quantum).
- **NuGet description:** "Review and restore the deleted records for entities with auditing enabled. The restore option just recreated the record with same deleted guid. Relationship may or may not get restored automatically."
- **Tags:** Dynamics, CRM, XRM, Plugins, Recycle, Bin.
- **Source:** https://github.com/deepakkumar1984/XrmToolBoxPlugins
  - Path: `BDK.XrmToolBox/BDK.XrmToolBox.RecycleBin/`
  - HEAD commit `5400548b`, 2023-11-23.
- **License:** **MIT**, "Copyright (c) 2019 Tech Quantum". It is in the repo `LICENSE` and repeated in every source file header. That is compatible with this MIT repo, but we will learn from it and not copy it. Credit the plugin, the author and the repo.
- **Related reference (not an XrmToolBox plugin):** Microsoft's own deleted record keeping (preview).
  - Developer docs: `MicrosoftDocs/powerapps-docs` → `developer/data-platform/restore-deleted-records.md` (ms.date 2026-01-30).
  - Admin docs: `MicrosoftDocs/power-platform` → `admin/restore-deleted-table-records.md`.
  - It covers the same job natively and better.
- **Confidence: high.** The NuGet id, author, project URL and license all match, and I read the full plugin source. The plugin is small: one control file (`PluginControl.cs`, 520 lines), two model classes and a `FetchXml.resx` holding three queries.
- **Existing Power Tools coverage:** none. `publicCatalog.ts` lists Attribute Explorer, Bulk Workflow Execution, Data Migration, the FetchXML tools, Plugin Registration, Polymorphic Lookup Creator, Solution Components Mover, Solution Layers Explorer, Translator and Workflow Activities Viewer.
  - FetchXML Builder or Tester could run a `datasource='bin'` query, but neither can restore.
  - So this should be a **new activity-bar tool**, not an extension of an existing one.

### What it does

1. Lists tables where table-level auditing is on (`IsAuditEnabled`).
2. Lists active users (`systemuser`, `isdisabled = 0`, `accessmode = 0`) so you can filter by who deleted.
3. For one table, a date range and an optional user, it finds Delete audit entries.
4. For each entry it shows the record name, the deletion date and who deleted it.
5. You can inspect the field values the record had just before deletion.
6. You can tick records and "restore" them. Restoring recreates the record with the same GUID from the audited old values.

### Backend findings

All paths are relative to `BDK.XrmToolBox/BDK.XrmToolBox.RecycleBin/`.

**1. Loading the table list (`PluginControl.cs` L276-289)**
- Runs `RetrieveAllEntitiesRequest { EntityFilters = EntityFilters.Attributes }`.
- Keeps tables where `IsAuditEnabled.Value` is true. It stores `ObjectTypeCode`, `DisplayName.UserLocalizedLabel.Label` and `PrimaryNameAttribute`.
- It caches the full `EntityMetadata` only to label fields later.
- Problems:
  - Loading every attribute for every table is very heavy.
  - `UserLocalizedLabel` can be null, which crashes.
  - It never checks the organization-level audit switch (`organization.isauditenabled`) or attribute-level audit flags.

**2. Loading the user list (`FetchXml.resx` "LicencedUsers"; `PluginControl.cs` L317-323)**
- FetchXML on `systemuser` with `isdisabled = 0` and `accessmode = 0`, ordered by `fullname`.
- It never pages, and it hides disabled users even though they may have deleted records.

**3. Finding deleted records (`FetchXml.resx` "DeletedAuditLogs" / "DeleteAuditLogsByUser"; `PluginControl.cs` L151-171)**
- FetchXML on `audit` with these conditions:
  - `operation eq 3` (Delete)
  - `createdon ge {from}` and `createdon lt {to+1 day}`
  - `objecttypecode eq {OTC int}`
  - optionally `userid eq {guid}`
- Columns returned: `objectid`, `userid`, `createdon`, `auditid`, plus a few others.
- For org versions before v8 it does a string replace of `regardingobject` with `object` (L153, L162). That is legacy and can be dropped.
- Problems:
  - No `<order>` and no paging, so results silently stop at 5,000 rows.
  - Dates are formatted from the local clock as `yyyy-MM-dd`, but `createdon` is compared in UTC, so the range is off by the time-zone difference.
  - Sorting happens client-side (L204).

**4. Reading each record's old values (`PluginControl.cs` L172-201)**
- For **every** audit row it runs `RetrieveAuditDetailsRequest { AuditId }`. That is one extra round trip per row.
- It keeps only `AttributeAuditDetail` results.
  - `OldValue` (an `Entity`) holds the record's last audited values.
  - The display name comes from `OldValue[PrimaryNameAttribute]` (L194-197).
- Field labels are matched by lower-casing `SchemaName` against the attribute key (L475-486).
  - Lookups are shown by `EntityReference.Name`; choices are shown as the raw `OptionSetValue.Value`.

**5. Restoring (`PluginControl.cs` L390-402)**
- For each ticked row it takes `AuditDetail.OldValue`, removes `statecode` and `statuscode`, and calls `Service.Create(entity)`. The entity keeps its original Id, so the GUID is preserved.
- It is one sequential call per record, with no batching.
- The single `try/catch` around the whole loop (L388-408) stops at the **first** failure. Records before the failure stay restored, and the user sees only one error message, with no per-record result.

**6. Connection check**
- `WhoAmIRequest` (L513-516). Not needed in Power Tools; `DataverseContextFilter` already validates the connection.

**Limits of the audit approach (the plugin does not handle these)**
- `OldValue` holds only attributes that are audited and not null. Fields that are not audited are lost.
- Many-to-many links, notes, attachments and file or image columns are not restored. Child records deleted by cascade are separate audit rows that must be recreated one by one.
- Removing `statecode` and `statuscode` makes every restored record active. An inactive record needs a follow-up `SetState`/`Update`.
- System columns (`createdon`, `modifiedon`, `createdby`, `versionnumber` and similar) are not valid on Create. `createdon` can only be kept through `overriddencreatedon`.
  - The fix is to filter attributes by `AttributeMetadata.IsValidForCreate`.
- Lookups pointing at records that were also deleted fail. Restore parents first.
- Create runs plug-ins and flows registered on Create.
- A record with that GUID that already exists, or one with a matching alternate key, gives a duplicate fault.
- Audit retention and the audit privileges limit what can be found at all.
- **Privileges:**
  - Reading the audit log needs the View Audit History / View Audit Summary privileges (`prvReadRecordAuditHistory` / `prvReadAuditSummary`). I am inferring these from platform knowledge; the plugin never checks them.
  - Recreating needs Create on the table, plus Assign rights if `ownerid` is kept.

**Native Dataverse recycle bin (Microsoft docs, preview)**
- **Turning it on:**
  - An admin enables "Keep deleted records" for the environment. The admin doc allows 1-90 days; the developer doc says up to 30 days.
  - Only records deleted *after* the background job "Enable keeping deleted data for Organization" finishes can be restored.
  - It is not available in Teams, trial or default environments.
- **Finding deleted records:**
  - Set `datasource='bin'` on `<fetch>`, or set `QueryExpression.DataSource = "bin"`.
  - Through the Web API, only FetchXML works for this.
  - The existing sidecar `RetrieveMultiple` path can run it unchanged.
- **Restoring:**
  - SDK: `OrganizationRequest("Restore") { Target = new Entity(table, id) { /* optional overrides */ } }`. The response's `Results["id"]` is the restored id.
  - Web API: `POST Restore` with `{ Target: { "@odata.id": ".../<set>(<id>)" } }`.
  - All original column values come back unless overridden. Records removed by cascade can be restored too.
  - Restore works only by primary key, not by alternate key.
- **Which tables are enabled:**
  - FetchXML on `recyclebinconfig` with `statecode = 0` and `isreadyforrecyclebin = 1`, inner-joined to `entity` on `entityid = extensionofrecordid`, returning `entity.logicalname`.
  - The row named `organization` holds `cleanupintervalindays`, the retention period.
  - If the table has no rows, the feature is off.
- **Known faults to map into user-facing messages:**

  | Fault name | Code | What it means | What the user should do |
  | --- | --- | --- | --- |
  | `RefCannotBeRestoredRecycleBinNotFound` | 0x80049959 | A referenced record is missing | Restore that related record first |
  | `DuplicateExceptionRestoreRecycleBin` | 0x80044a02 / 0x80049939 | A record with the same primary key exists | Delete the conflicting record first |
  | `DuplicateExceptionEntityKeyRestoreRecycleBin` | 0x80049929 | A record with matching alternate key values exists | Delete the conflicting record first |
  | `PicklistValueOutOfRangeRecycleBin` | 0x80049949 | A choice option the record used has since been removed | Add the option back first |

- **Not supported:** solution components, virtual tables, elastic tables, and a fixed list of system tables.
- **Unverified:**
  - Whether bin rows expose "deleted on" and "deleted by" columns. The docs show only regular columns.
  - The privileges `Restore` needs. The admin UI requires System Administrator.
  - The Dataverse reviewer must confirm both against a live environment.

**Keep from the plugin:**
- Filters by table, date range and deleting user.
- The audit `operation = 3` query.
- `RetrieveAuditDetails` to get `OldValue`.
- Recreating with the same GUID while removing `statecode`/`statuscode`.
- Showing the primary name from the old values.

**Leave behind:**
- The `RetrieveAllEntities(Attributes)` scan, the object type code filter and the pre-v8 string hack.
- No paging, local-time dates and one extra call per row.
- Stopping at the first error with no per-record result.
- The WinForms grid and checkbox handling, MessageBox prompts, GitHub/PayPal interfaces and icons.

### Power Tools mapping

**Tool**

| | |
| --- | --- |
| Tool id | `recycle-bin` |
| Title | Recycle Bin |
| Tooltip | "Find deleted records and restore them from the Dataverse recycle bin or the audit log" |
| Catalog description | "Find records deleted from an environment and restore them with the same ID, from the Dataverse recycle bin or, when it is off, from the audit log." |
| Placement | New activity-bar tool, `allowMultipleInstances: true`. Add it to `registry.tsx` and to `publicCatalog.ts` in registry order (between Polymorphic Lookup Creator and Solution Components Mover if the list stays alphabetical). |
| Connections | Single environment: `useTabConnection` plus `meta.connectionName`, no target connection. |

**Reuse:**
- `GET /api/metadata/entities/{logicalName}/attributes` for field labels and types in the detail view (react-query cached).
- `apiGet`/`apiPost` from `desktop/src/ui/shared/api/client.ts`.
- `useToolStatus` for "N restored / M failed".
- Shared UI from `desktop/src/ui/shared/ui`.
- Do **not** reuse `/api/fetch/execute` directly. Restore has to happen in the sidecar, and a typed endpoint lets us inject `datasource='bin'` and the audit conditions safely.
- Do **not** reuse `/api/metadata/entities` for the table picker: `EntityInfo` has no audit or recycle-bin flags. Keep the new table type private to the tool rather than widening the shared contract.

**New sidecar group: `api/PowerTools/PowerTools.API/Tools/RecycleBin/`**
- Files: `RecycleBinEndpoints.cs`, `RecycleBinService.cs`, `RecycleBinClient.cs`, `RecycleBinDtos.cs`, `RecycleBinFaults.cs`.
- Follow the SolutionLayers pattern: `MapGroup("/api/recycle-bin").AddEndpointFilter<DataverseContextFilter>()`, a service result type plus `ToHttp` returning `{ code, message }`.
- Register with `app.MapRecycleBinEndpoints()` in `Program.cs`.

Endpoints:

1. **`GET /api/recycle-bin/status`** returns `{ binEnabled, retentionDays, auditEnabled }`.
   - Gets: `recyclebinconfig` row count and the `name = 'organization'` row's `cleanupintervalindays`, plus `Retrieve organization` (`isauditenabled`).
2. **`GET /api/recycle-bin/tables?source=bin|audit`** returns `[{ logicalName, displayName, primaryIdAttribute, primaryNameAttribute, binEnabled, auditEnabled }]`.
   - Gets: `RetrieveAllEntitiesRequest { EntityFilters = Entity }` (not Attributes). For `bin` it joins the enabled-tables FetchXML above; for `audit` it filters on `IsAuditEnabled`.
   - Use a null-safe display label.
3. **`GET /api/recycle-bin/users?search=`** returns `[{ id, fullName, isDisabled }]`.
   - Gets: `systemuser` FetchXML, top 50, `fullname like`. It **includes** disabled users.
4. **`POST /api/recycle-bin/deleted`** returns `{ records: [{ recordId, table, name, deletedOn?, deletedBy?, auditId? }], pagingCookie, moreRecords }`.
   - Body: `{ source, table, fromUtc, toUtc, deletedByUserId?, pageSize (≤250), pagingCookie?, page? }`.
   - `bin` source: FetchXML on `table` with `datasource='bin'`, the primary id and name columns, paged with a paging cookie. Date and user filters apply only if the reviewer confirms that bin rows expose those columns.
   - `audit` source: FetchXML on `audit` with `operation = 3`, `objecttypecode = '<logicalName>'` (by name, not number), `createdon` between the UTC bounds, optional `userid`, `<order attribute='createdon' descending='true'/>` and paging.
   - Then one `ExecuteMultipleRequest` (`ContinueOnError = true`, `ReturnResponses = true`) of `RetrieveAuditDetailsRequest` for the page. Keep only `AttributeAuditDetail` and read the name from `OldValue[primaryName]`.
5. **`GET /api/recycle-bin/records/{table}/{id}?source=&auditId=`** returns `{ fields: [{ logicalName, value, formatted }] }`.
   - `bin`: `datasource='bin'` fetch with all attributes, filtered by primary id.
   - `audit`: `RetrieveAuditDetails(auditId).OldValue`, serialized with lookup name and target, choice values, money and dates in UTC.
6. **`POST /api/recycle-bin/restore`** returns `{ results: [{ table, recordId, status: "restored" | "failed" | "skipped", code?, message? }] }`.
   - Body: `{ source, items: [{ table, recordId, auditId? }] }`, at most about 100 items per call. The client splits larger selections and reports progress.
   - `bin`: `OrganizationRequest("Restore") { Target = new Entity(table, id) }`, one record at a time, continuing past failures and mapping faults through `RecycleBinFaults`.
   - `audit`: `RetrieveAuditDetails`, then strip attributes where `IsValidForCreate != true` (from `RetrieveEntityRequest(Attributes)`, cached per call), plus `statecode`/`statuscode`. Map `createdon` to `overriddencreatedon`, then `Create`.
     - If the old state was not active, follow with an `Update` of `statecode`/`statuscode`.
     - Return a fault for a duplicate id.
   - Order items so parents come before children. A simple rule: oldest deletion first for audit; for bin, follow the user's order and rely on clear `RefCannotBeRestored` messages.

**Desktop folder: `desktop/src/ui/tools/recycle-bin/`**
- `tool.ts` (`defineTool`), `RecycleBin.tsx`, `recycle-bin-icon.svg`
- `api/recycleBinApi.ts` and `api/queryKeys.ts`
- `model/types.ts`, `model/faults.ts` (fault code → plain message), `model/restoreBatches.ts` (chunking and ordering), `model/sourceChoice.ts` (default to bin when enabled, otherwise audit)
- `components/`: SourceBanner (status: bin on/off, retention, audit on/off), FilterBar (table, dates, deleted by), DeletedRecordsTable (selection, paging), RecordDetails, RestoreDialog (confirmation and per-record results)
- `tests/node/*.test.ts` for the model, `tests/renderer/recycleBin.test.tsx`, and `tests/fixtures.ts`

### Recommended implementation

1. **Sidecar data types and fault map.** Write `RecycleBinDtos.cs` and `RecycleBinFaults.cs` (the four documented recycle-bin faults, plus duplicate key and missing privilege on the audit path).
2. **Status and tables endpoints.** Add `/status` and `/tables` (recycle-bin config fetch, metadata with `EntityFilters.Entity`, organization audit flag), then register in `Program.cs`. Add sidecar unit tests that put a fake behind `RecycleBinClient`, mirroring `SolutionLayersClient`.
3. **Native recycle bin listing and restore (first slice that can ship).** Add `/deleted` and `/records` for `source=bin`, then `/restore` with the `Restore` message, per-record results and fault mapping. Test that one failure does not stop the remaining records and that each fault maps correctly.
4. **Audit fallback (second slice).** Add `source=audit` to `/deleted` (paged audit fetch, batched `RetrieveAuditDetails`), `/records` and `/restore` (filter by `IsValidForCreate`, strip state, `overriddencreatedon`, state follow-up). Test attribute filtering and UTC date bounds.
5. **Tool module.** Build the API hooks (react-query; restore as a mutation that sends chunks one after another and publishes progress through `useToolStatus`), then the model helpers, then the components.
   - The source banner should explain clearly:
     - when the recycle bin is off, only audited fields can be recovered;
     - only records deleted after the feature was turned on are available;
     - business logic on Restore or Create will run.
   - Restoring must always ask for confirmation.
6. **Register the tool.** Add it to `registry.tsx` and `publicCatalog.ts` in registry order.
7. **Tests.** Node tests for chunking and ordering, fault messages and source selection. A renderer test with fixtures for both sources and a partial-failure restore.
8. **Save this brief** unchanged at `desktop/docs/tools/recycle-bin/brief.md`, per the pipeline.

**Risks and constraints**
- The native recycle bin is a **preview** API. Pin it behind the status check and handle "not enabled" without errors.
- Restore privileges and bin date/user columns are unverified; the Dataverse reviewer must confirm both.
- Audit-based restores are lossy (only audited, non-null fields; no N:N links, notes or files). The UI must say so before restoring.
- Both restore paths run plug-ins and flows on Restore or Create.
- **License:** the plugin is MIT, so it is fine to learn from. Credit "Recycle Bin by Deepak Battini / Tech Quantum, github.com/deepakkumar1984/XrmToolBoxPlugins" in the brief. Do not copy the source, the resx FetchXML text, the WinForms layout, the icons or the description text.

**Relevant paths**
- Plugin source (scratchpad clone): `/tmp/claude-0/-home-user-PowerTools/fffcaa97-ad22-5142-b9a6-52fb8c135517/scratchpad/rb/src/BDK.XrmToolBox/BDK.XrmToolBox.RecycleBin/`
- Microsoft docs (scratchpad): `/tmp/claude-0/-home-user-PowerTools/fffcaa97-ad22-5142-b9a6-52fb8c135517/scratchpad/msdocs/`
- Pattern to follow: `/home/user/PowerTools/api/PowerTools/PowerTools.API/Tools/SolutionLayers/SolutionLayersEndpoints.cs`
- Registration: `/home/user/PowerTools/api/PowerTools/PowerTools.API/Program.cs`, `/home/user/PowerTools/desktop/src/ui/tools/registry.tsx`, `/home/user/PowerTools/desktop/src/ui/tools/publicCatalog.ts`

**Sources:**
- [NuGet: BDK.XrmToolBox.RecycleBin](https://www.nuget.org/packages/BDK.XrmToolBox.RecycleBin/)
- [Plugin source repository](https://github.com/deepakkumar1984/XrmToolBoxPlugins)
- [Microsoft: Restore deleted table records (admin)](https://learn.microsoft.com/en-gb/power-platform/admin/restore-deleted-table-records)
- [Microsoft docs source on GitHub](https://github.com/MicrosoftDocs/power-platform/blob/main/power-platform/admin/restore-deleted-table-records.md)
- [Nishant Rana: Using the Restore Message to Recover Deleted Records in Dataverse](https://nishantrana.me/2026/01/20/using-the-restore-message-to-recover-deleted-records-in-dataverse/)
- [Rajeev Pentyala: Dataverse restore deleted table records (preview)](https://rajeevpentyala.com/2024/05/06/dataverse-restore-deleted-table-records-preview/)

### UX

Written from `### What it does` only: list audited tables, list active users, find Delete audit entries for one table in a date range with an optional user, show each record's name, deletion date and deleting user, inspect the field values the record had before deletion, and restore checked records with the same ID from those values. Anything else is out of v1 (see "What not to build"). Whether the native Dataverse recycle bin is also a source is an open question below; this section does not add screens for it.

#### Sidebar

- Tool id `recycle-bin`. Show it in the activity bar (`showInActivityBar: true`), one row under the existing Search tools field.
- Title: **Recycle Bin**. Tooltip: **Find deleted records in the audit log and restore them with the same ID**. The tooltip is the activity-bar button `title` and accessible name.
- More than one tab (`allowMultipleInstances: true`). Choosing the sidebar entry again opens another tab. Each tab keeps its own table, date range, deleted-by user, results, checked rows, selected record, field search text, sort, and restore results. Every tab follows the selected environment; when the environment changes, the tab clears its results, checks and selection and reloads its table and user lists.
- Icon: a new single-color SVG of a bin with a circular arrow, drawn through `ToolIcon`. Do not reuse the plugin icon.

#### Public listing

- Title: **Recycle Bin**.
- Description: **Find records deleted from audited Dataverse tables, see the values they had before deletion, and recreate them with the same ID.**
- Add it to `publicCatalog.ts` in the same position as in `ACTIVITY_BAR_TOOLS`. Do not edit the welcome page or website markup.

#### Title bar

No title-bar menu item. File, Edit, View, and Help stay unchanged. Every action lives on the tool tab.

#### Tool tab

The tab is `bg-canvas`. The environment is the connection chosen in the sidebar footer. There is no connection picker in the tab.

From top to bottom: a filter `Toolbar` across the full width, then the work area split left and right with a draggable divider. Use `Group`, `Panel`, and `Separator` from `react-resizable-panels`, as in `desktop/src/ui/shell/layout/Layout.tsx`, `orientation="horizontal"`.

- Left `Panel` `id="rb-records"`: the deleted records. `defaultSize="58%"`, `minSize="35%"`.
- `Separator` `aria-label="Resize panes"`, classes `w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent`.
- Right `Panel` `id="rb-details"`: the field values of the selected record. `minSize="25%"`.

Panels are `bg-surface`. Headings are `text-fg-strong`, values `text-fg`, hints and metadata `text-fg-muted`. Logical names, record IDs and raw values use `font-mono`.

##### 1. No environment

Both panes show one `EmptyState`: **Select an environment** with the description "Choose an environment in the connection control at the bottom of the sidebar." Every filter and action is disabled. Nothing is loaded.

##### 2. Filter toolbar

A `Toolbar`, left to right, each control inside a `Field` with a visible label:

- **Table**: `Select` of the tables that have auditing turned on, labeled "{Display Name} ({logical name})", sorted by display name. First option **Choose a table**, not selectable as a search. A table with no display label shows its logical name only.
- **From**: `Input` `type="date"`. Default: 30 days before today.
- **To**: `Input` `type="date"`. Default: today. Both dates are local calendar days and include the whole To day. When From is after To, the To `Field` shows the error "To must be on or after From." and **Find** is disabled.
- **Deleted by**: `Select` of active users by full name, sorted by full name. First option **Anyone** (default).
- In the toolbar `end`: `Button` variant `secondary` **Find deleted records**, enabled when a table is chosen and the dates are valid. Enter in any filter control runs it too.

Changing a filter does not search by itself. It keeps the current results until **Find deleted records** runs again, and a `text-xs text-fg-muted` line above the table reads "Filters changed. Find again to update the list." while they differ.

##### 3. Deleted records (left)

A header row: "Deleted {table display name}" in `text-base font-semibold text-fg-strong`, then the result count in `text-xs text-fg-muted` ("124 records"). On the right of the header: `Button` variant `primary` **Restore (N)**, enabled when at least one row is checked. It opens the restore dialog (step 5).

Results are a `DataTable` (row key = audit entry id, so two deletions of the same ID stay separate rows), with its parent `min-h-0 flex-1`. Columns:

| Header | Content | Sortable |
| --- | --- | --- |
| (checkbox) | `Checkbox` per row, `aria-label` "Select {name}". Header `Checkbox` **Select all records** checks or clears every loaded row and shows indeterminate for a partial set. | No |
| Name | The record's primary name from its old values. When empty, `text-fg-muted` "(No name)". | Yes |
| Deleted On | Local date and time | Yes |
| Deleted By | User full name | Yes |
| Record ID | GUID in `font-mono text-xs` | No |
| Result | Empty until a restore run, then `Badge` tone `ok` **Restored** or tone `danger` **Failed** | No |

Sorting is a click on a column header: first click ascending, the same header again descending, ↑ or ↓ on the active header. Default: Deleted On descending (the active header shows ↓). No separate sort buttons. Headers are title case as written.

Results load a page at a time. When more matches exist, a `Button` variant `secondary` size `sm` **Load more** sits under the table with `text-xs text-fg-muted` "Showing {n} records. More match these filters." Sorting applies to the loaded rows only, and that line says so.

Clicking a row selects it (`selectedKey`, `bg-accent-soft`) and shows its values on the right. Checking a box does not select the row, and selecting a row does not check it.

##### 4. Record details (right)

A header: the record name in `text-base font-semibold text-fg-strong`, then on one line in `text-xs text-fg-muted`: table logical name, record ID (`font-mono`), "Deleted {date time} by {user}".

Under it, an `Alert` tone `info`: "These are the values recorded in the audit log when the record was deleted. Only audited fields that had a value appear here, and only these are restored."

Then `SearchInput` with placeholder **Filter fields**, then a `DataTable` (row key = field logical name), parent `min-h-0 flex-1`:

| Header | Content | Sortable |
| --- | --- | --- |
| Display Name | Field display label; logical name when there is none | Yes |
| Name | Field logical name in `font-mono` | Yes |
| Value | Formatted value: lookup as the related record's name, choice as its label, dates in local time, yes/no as Yes or No. The raw value is the cell `title`. | No |

Default sort: Display Name ascending. The filter matches display name, logical name and value text.

##### 5. Restore

**Restore (N)** opens a `Modal` titled **Restore deleted records**.

- Body: "Recreate these N records in **{table display name}** with their original IDs?" followed by a scrolling list (max height, `text-sm text-fg`) of "{name} · deleted {date}".
- `Alert` tone `warn`: "Each record is recreated only from the field values shown in its details. Fields that were not audited, links to other records stored outside the record, notes, and files do not come back. Plug-ins and flows that run when a record is created will run."
- When two checked rows share a record ID, an `Alert` tone `warn` above the list: "{n} records were deleted more than once. Only the most recent deletion of each is restored." and the older duplicates are left out of the run.
- Buttons: `Button` secondary **Cancel** first, then `Button` primary **Restore N records**.
- On confirm the dialog stays open and switches to progress: `ProgressBar` for done out of N, and a `DataTable` with columns **Record**, **Result**, **Detail**, one row per record as it finishes. Result is `Badge` tone `ok` **Restored** or tone `danger` **Failed**; Detail shows the error in plain words for a failure (for example "A record with this ID already exists." or "A related record this one points to no longer exists. Restore that record first."). One failure never stops the run.
- While running, the footer shows `Button` secondary **Stop**, which finishes the current request and starts no more. The `Modal` is `busy` with busy label "Restoring records…" while a request is in flight, so it cannot be closed mid-request.
- When the run ends, the footer shows a summary in `text-sm` ("{r} restored, {f} failed") and `Button` primary **Done**. Done closes the dialog, fills the **Result** column for those rows, unchecks the restored rows, and keeps failed rows checked so they can be retried.
- A `useToast` `success` "{r} records restored." after Done when all succeeded; `error` "{f} of {N} records could not be restored." when any failed.

#### States

Status text is published with `useToolStatus`; the tool does not manage status ids.

- **Loading.**
  - Tables and users: `Spinner` inside the Table and Deleted by fields' area; both selects disabled. Status `Loading audited tables…`.
  - Search: `Spinner` centered in the left panel; previous results are cleared, not shown stale. Status `Finding deleted records…`. **Load more** shows a `Spinner` in the button and keeps the loaded rows.
  - Details: `Spinner` in the right panel. Status `Loading field values…`.
  - Restore: `ProgressBar` in the dialog. Status `Restoring records: n of N`.
- **Empty.**
  - No environment: step 1. Status `No environment selected`.
  - No audited tables: `EmptyState` across both panes "No tables have auditing turned on in this environment." with the description "Turn on auditing for the environment and the table, then refresh." and an icon `Button` ghost with `RotateCw`, `aria-label="Reload tables"`. Not an error.
  - No table chosen: left `EmptyState` "Choose a table and a date range, then find deleted records." Right `EmptyState` "Select a deleted record to see the values it had."
  - Search with no matches: table empty message "No deleted records match these filters." Status `0 deleted records`.
  - No row selected: right `EmptyState` "Select a deleted record to see the values it had."
  - Selected record has no audited values: right `EmptyState` "The audit log holds no field values for this record, so it cannot be restored." Its row checkbox is disabled with a `Tooltip` saying the same.
  - Field filter with no matches: "No fields match the filter."
- **Success.**
  - Search: status `{n} deleted records`.
  - Restore: `useToast` as in step 5, status `{r} restored, {f} failed`.
- **Error.** Errors show in an `Alert` tone `danger` in the pane they belong to, with a `Button` secondary size `sm` **Try again** that repeats the same request. Text is the server message in plain words.
  - Missing privilege to read the audit log: `Alert` tone `danger` "You do not have permission to read audit history in this environment." without **Try again**.
  - A failed restore of one record is a row result in the dialog, never a page error.

#### Shared controls

From `desktop/src/ui/shared/ui`: `Toolbar`, `Field`, `Select`, `Input` (`type="date"`), `Button`, `Checkbox`, `DataTable`, `SearchInput`, `Modal`, `ProgressBar`, `Spinner`, `Alert`, `Badge`, `EmptyState`, `Tooltip`, `useToast`. Plus `Group`, `Panel` and `Separator` from `react-resizable-panels` for the divider. Icons from `lucide-react` (`RotateCw`). No new shared controls and no new color tokens.

#### What not to build

- No native Dataverse recycle bin source, source switch or source banner in v1 unless the open question below adds it.
- No export of records or field values, no editing of values before restoring, no restoring to a different ID or a different environment.
- No restoring of related records, notes, attachments, many-to-many links or records removed by cascade beyond what is checked in the list.
- No search across several tables at once and no "all tables" option.
- No deleting of audit entries or purging of anything.
- No title-bar menu item, no connection picker in the tab, no `WhoAmI`-style connection test button.
- Do not copy the WinForms layout of the plugin: no left-docked grid with a property grid under it, no MessageBox prompts, no GitHub or donation links, no plugin icons or plugin copy.

### Open questions

- **Product scope: audit log only, or the native recycle bin too?** `### What it does` describes only the audit-log restore, and the UX above is written to that. The research summary recommends the Dataverse recycle bin (preview) as the better restore path, with the audit log as a fallback. These are two real scopes. If the native recycle bin is in v1, the UX adds one source line under the filter toolbar ("Recycle bin, keeps records {n} days" or "Audit log"), uses the same table, filters, list, details and restore dialog, and drops the "only audited fields" wording for bin records. Decide: audit only (as specified), or recycle bin first with audit fallback.
