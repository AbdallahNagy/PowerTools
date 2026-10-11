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
