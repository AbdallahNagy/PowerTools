## Bulk Workflow Execution: research brief

### Match

- **Plugin:** Bulk Workflow Execution, "Execute Workflows in Bulk using CRM Views or FetchXML Queries."
- **Catalog URL:** https://www.xrmtoolbox.com/plugins/AndyPopkin.BulkWorkflowExecution/. **This page could not be fetched.** The network egress proxy blocks `www.xrmtoolbox.com`, so the catalog tags, download count and "open source" flag are not verified.
- **NuGet id:** `AndyPopkin.BulkWorkflowExecution`. NuGet lists three versions: `1.2016.5.17`, `1.2016.6.7` and `1.2017.7.21` (published 2017-07-28). The last version targets XrmToolBox 1.2017.7.18 DLLs. Tags: XrmToolBox, Plugin, Bulk, Workflow.
- **Author:** Andy Popkin (`apopkin` on earlier versions).
- **Source:** https://github.com/andypopkin/XrmToolBox---Bulk-Workflow-Execution (from the NuGet `projectUrl`). I cloned it. The last commit is `f3d0727`, "Added button for FetchXML Builder integration…". It has not been maintained since 2017.
- **License: none declared.**
  - There is no LICENSE file in the repo.
  - NuGet has no `licenseUrl` or `licenseExpression`.
  - The GitHub API could not be checked: `gh` returned 403 because the repo is not attached to this session.
  - With no license, the code is all rights reserved. **Use it as inspiration only. Copy no source, strings or icons.**
- **Related plugins:** none checked, because the catalog is blocked. Bulk Data Updater (Jonas Rapp) is a well-known neighbour for query-driven bulk operations. I did not read its source for this brief.
- **Confidence: high** on the backend behaviour, because the full domain logic is in one 1,437-line file that I read completely. **Medium** on catalog metadata (see above).

### What it does

1. Lists classic workflows that are activated and on-demand.
2. For the selected workflow, lists active system views (`savedquery`) and personal views (`userquery`) on its primary entity, and loads the view FetchXML into an editor. Users can also paste FetchXML, or send it to FetchXML Builder through the XrmToolBox message bus.
3. "Validate Query" turns the FetchXML into a query, pages through every matching record ID, and shows the count. It keeps that ID list as the execution set.
4. "Start Workflows" calls `ExecuteWorkflow` once per record. The calls go out in `ExecuteMultiple` batches, with:
   - a configurable batch size (default 200);
   - an optional delay of N seconds between batches;
   - a progress count and estimated time remaining;
   - a Stop button that takes effect only after the current batch.
5. At the end it shows the number started and the number of errors. The error messages themselves are not shown.

### Backend findings

All citations are in `XrmToolBox - Bulk Workflow Execution 2015/BulkWorkflowExecution.cs`.

**Workflow list (L303-315).** `RetrieveMultiple(QueryExpression("workflow"))`:
- Columns: `workflowid`, `name`, `primaryentity`. `Distinct = true`, ordered by name.
- Filter: `category = 0` (classic workflow), `activeworkflowid NotNull`, `ondemand = true`.
- No paging. Fine in practice.
- Gaps to fix in our version:
  - It does not filter on `type = 1` (Definition) or `statecode = 1`. It relies on `activeworkflowid` being set on the activated definition. We should add `type eq 1` and `statecode eq 1`.
  - It does not show `mode`. Real-time workflows (`mode = 1`) run synchronously inside the request. Background workflows (`mode = 0`) only queue an `asyncoperation`. We should show `mode`.
  - Business process flows, Actions (category 3) and Power Automate flows (category 5) are out of scope. `ExecuteWorkflow` only applies to category 0.

**View list (L466-518).** Two `RetrieveMultiple` calls:
- `savedquery` with `querytype = 0`, `returnedtypecode = <workflow.primaryentity>`, `statecode = 0`, `fetchxml NotNull`.
- The same filter on `userquery`. This returns only personal views the caller can see (owned or shared).
- Both use `ColumnSet.AllColumns`, which is wasteful. We only need the id, `name` and `fetchxml`.
- Bug: L507 adds the sort order to `query` instead of `query2`, so personal views are not sorted.
- The view divider is a dummy entity inserted into the list (L496-500). That is UI-only; leave it behind.

**Count / ID snapshot (L685-770).**
- `FetchXmlToQueryExpressionRequest` converts the FetchXML (L699-707). An invalid query shows the server fault (L709-713).
- It clears the columns so only the IDs come back (L717).
- It pages at `PageInfo.Count = 5000`, with `PageNumber++` and `PagingCookie` from `results.PagingCookie` while `MoreRecords` is true (L718-756).
- It collects every entity into `ExecutionRecordSet`. That list is what gets executed later, so **the plugin snapshots IDs before it executes. Keep this.** If the workflow changes fields the filter uses, re-querying during the run would skip or repeat records.
- It never checks that the FetchXML root entity matches the workflow's `primaryentity`. A mismatch fails every record at execute time. **Add this check.**
- It does not handle `aggregate`, `top`, or duplicate IDs from link-entities. The conversion request can fail on `top` combined with paging. We should reject `aggregate`, honour `top` as a cap, and de-duplicate IDs.

**Execution (L882-961, L1079-1136).**
- `ExecuteMultipleRequest` with `ContinueOnError = true` and `ReturnResponses = false` (L914-924). With `ContinueOnError = true`, faulted items are still returned.
- Batch size comes from the text box, default 200 (L927). The UI says 0-1000, but the check at L219 is broken: `!isNumeric && n <= 1000`. We should clamp to 1..1000; 1000 is the platform maximum for `ExecuteMultiple`.
- Each record becomes `new ExecuteWorkflowRequest { WorkflowId = selectedWorkflow.Id, EntityId = record.Id }` (L935-939).
- When the batch is full, it calls `Service.Execute(emr)` and `HandleErrors`, then clears the batch (L1117-1119).
- The estimated time remaining is the average batch duration × remaining batches (L1121-1128).
- It then sleeps for `interval × 1000` ms (L1130-1133). This is the only throttling it does. It has no 429 or service-protection retry and no concurrency handling. Batches run one after another, which is correct, because the platform limits how many `ExecuteMultiple` calls can run in parallel.
- Stop sets a flag (L171), checked before each record is queued (L933). The pending partial batch is not sent.

**Final flush (L1138-1188).**
- If `emrCount > 0`, it always runs `Execute` on the remaining batch. When the total is an exact multiple of the batch size, that batch is empty. I have not verified whether Dataverse faults on an empty `ExecuteMultiple`. Either way, **skip empty batches.**

**Errors (L1190-1206).**
- It only counts faults. `Fault.Message` and the record ID (via `RequestIndex`) are thrown away.
- **Our version should keep both**, as `MigrationJobRunner.ProcessBatch` already does in `api/PowerTools/PowerTools.API/Services/MigrationJobRunner.cs`.

**Privileges and connection.**
- One connection.
- Read on `workflow`, `savedquery` and `userquery`.
- Read on the target entity.
- "Execute Workflow Job" (Miscellaneous privileges) to start on-demand workflows. **Unverified — for the Dataverse review to confirm.**
- The workflow runs in the caller's context.

**Keep:**
- the workflow filter (strengthened as above);
- view sourcing from system and personal views;
- the ID snapshot before running;
- `ExecuteMultiple` + `ContinueOnError`;
- batch size and inter-batch delay;
- sequential batches;
- cooperative stop after the current batch;
- progress and estimated time remaining.

**Leave behind:**
- WinForms, message boxes, the help text and the donate/contact copy;
- the XrmToolBox message-bus hand-off to FetchXML Builder;
- loading every column of a view;
- discarding fault messages;
- the empty final batch.

### Power Tools mapping

**Existing coverage:** none. Workflow Activities Viewer only lists processes that reference a custom workflow activity. FetchXML Builder and FetchXML Tester run queries but cannot execute workflows. **This should be a new activity-bar tool, not an extension of an existing one.**

**Reuse:**
- `api/PowerTools/PowerTools.API/Tools/Fetch/FetchXmlPaging.Apply` for FetchXML paging-cookie handling. The paging works directly on FetchXML; no `QueryExpression` conversion is needed.
- `GET /api/metadata/entities` to resolve the primary-id attribute and display names.
- The background-job pattern from Solution Components Mover: `SolutionComponentsMoverEndpoints.cs`, `SolutionCopyJob.cs`, `SolutionCopyJobRunner.cs` (store + hosted runner + polled `GET`).
- The `ExecuteMultiple` fault-mapping pattern from `Services/MigrationJobRunner.cs`.
- Shared UI from `desktop/src/ui/shared/ui`: `DataTable`, `ProgressBar`, `Button`, `SearchInput`, `Modal`, `Toast`.
- `useTabConnection`, `useToolStatus`, and `apiGet`/`apiPost` with `meta.connectionName`.
- `POST /api/fetch/execute` is **not suitable** for the count. It caps pages at 250 and does not collect every ID.

**New sidecar endpoints:** group `/api/bulk-workflow-execution` in `api/PowerTools/PowerTools.API/Tools/BulkWorkflowExecution/`, with `DataverseContextFilter`.

1. **`GET /workflows`**
   - Returns `[{ id, name, primaryEntity, mode: "background" | "realtime", isManaged }]`.
   - Call: `RetrieveMultiple` on `workflow` with `category = 0`, `type = 1`, `statecode = 1`, `ondemand = true`, `primaryentity != "none"`, ordered by name.
2. **`GET /views?entity={logicalName}`**
   - Returns `[{ id, name, kind: "system" | "personal", fetchXml }]`.
   - Call: `RetrieveMultiple` on `savedquery` and on `userquery`, with `querytype = 0`, `statecode = 0`, `returnedtypecode = entity`, `fetchxml NotNull`, and columns `name` + `fetchxml` only.
3. **`POST /count`**
   - Body: `{ workflowId, fetchXml }`. Returns `{ count, entity }`.
   - Validation, all returned as typed 400 problems:
     - the root entity equals the workflow's primary entity;
     - no `aggregate`;
     - the FetchXML is well formed (DTD prohibited, as `FetchXmlPaging` does).
   - Rewrites the FetchXML to select only the primary id. It strips the attributes on the root and on link-entities, and adds `distinct` when link-entities are present.
   - Pages at 5000 with paging cookies and de-duplicates the IDs.
4. **`POST /runs`**
   - Body: `{ workflowId, fetchXml, batchSize (1-1000, default 100), delaySeconds (0-300) }`. Returns `{ jobId }`.
   - Validates as in `/count`, then saves the job to `IBulkWorkflowJobStore` together with the connection context.
   - The hosted `BulkWorkflowJobRunner` then:
     - collects the IDs into a snapshot (phase `collecting`);
     - executes them (phase `running`) in sequential `ExecuteMultipleRequest` batches of `ExecuteWorkflowRequest { WorkflowId, EntityId }`, with `ContinueOnError = true` and `ReturnResponses = false`;
     - maps `Fault` + `RequestIndex` to `{ recordId, message }`;
     - skips empty batches;
     - waits `delaySeconds` between batches;
     - relies on ServiceClient's built-in 429 retry.
5. **`GET /runs/{jobId}`**
   - Returns `{ status: "collecting" | "running" | "cancelling" | "cancelled" | "completed" | "failed", total, processed, succeeded, failed, errors: [{ recordId, message }] (capped, e.g. 500), startedAt, estimatedSecondsRemaining }`.
6. **`POST /runs/{jobId}/cancel`**
   - Sets a cancel flag. The runner stops after the in-flight batch.
   - This is new: the existing job stores have no cancel operation.

Register `app.MapBulkWorkflowExecutionEndpoints()`, the job store singleton and the hosted runner in `api/PowerTools/PowerTools.API/Program.cs`.

**Desktop tool**
- **Id:** `bulk-workflow-execution`
- **Title:** "Bulk Workflow Execution"
- **Tooltip:** "Run an on-demand workflow against every record a view or FetchXML query returns"
- **Manifest:** `showInActivityBar: true`, `allowMultipleInstances: true`.
- **Folder:** `desktop/src/ui/tools/bulk-workflow-execution/`
  - `tool.ts`, `BulkWorkflowExecution.tsx`, an icon svg
  - `api/` (`bulkWorkflowApi.ts`, `queryKeys.ts`)
  - `model/` (`types.ts`, `apiError.ts`, `run.ts` for progress, estimated time and status text)
  - `components/` (workflow picker, view picker with system/personal groups, FetchXML editor, run settings, run progress and errors)
  - `tests/` (`fixtures.ts`, `node/`, `renderer/`)
- Contracts stay private to the tool.
- Add the tool to `publicCatalog.ts` in registry order.

### Recommended implementation

1. **Sidecar read endpoints.**
   - Add `BulkWorkflowExecution{Dtos,Client,Queries,Service,Faults,Endpoints}.cs`, modelled on WorkflowActivities and SolutionComponentsMover.
   - Implement `GET /workflows`, `GET /views` and `POST /count`.
   - Put the FetchXML id-only rewrite and validation in a pure static class, so it can be unit-tested.
2. **Sidecar run job.**
   - Add `BulkWorkflowJob`, an in-memory `IBulkWorkflowJobStore` and a `BulkWorkflowJobRunner` hosted service.
   - Implement `POST /runs`, `GET /runs/{id}` and `POST /runs/{id}/cancel`.
   - Behaviour: ID snapshot first, sequential `ExecuteMultiple` batches, fault capture, empty-batch skip, delay, cancel between batches.
   - Register everything in `Program.cs`.
3. **Sidecar tests** in a new `PowerTools.API.BulkWorkflowExecution.Tests` project, or an existing one following that pattern:
   - FetchXML rewrite: attributes stripped, `distinct` added, aggregate rejected, entity mismatch rejected;
   - batch splitting, including an exact multiple of the batch size producing no empty batch;
   - fault-to-record mapping;
   - cancel flag;
   - estimated time remaining.
4. **Desktop tool module.**
   - Picking a workflow loads the views for its entity. Picking a view fills an editable FetchXML box.
   - "Count records" calls `/count`.
   - "Start" asks for confirmation, showing the count, the workflow and whether it is real-time. It then posts `/runs`.
   - The run screen polls `/runs/{id}` with react-query `refetchInterval` while the run is active. It shows `ProgressBar`, the counts, the estimated time remaining and an errors `DataTable` with record IDs. It has a Stop button.
   - Publish "running N/M" through `useToolStatus`.
5. **Registry:** add the tool to `registry.tsx` and `publicCatalog.ts` in the same order.
6. **Desktop tests:** node tests for the `model/run.ts` helpers; renderer tests for the picker cascade, the count gate before Start, and progress and error rendering with fixtures.

**Risks and constraints**
- **License:** none declared. Implement from these notes only. Copy nothing verbatim, including the help text, icons and message strings.
- **Async queue load:** starting thousands of background workflows floods the async queue. Default to a moderate batch size (100) and show a warning above a threshold (e.g. 10k records).
- **Real-time workflows:** these run synchronously inside `ExecuteMultiple`, so batches are slow and timeouts are possible. Suggest smaller batches for them.
- **Job state is in memory:** it is lost if the sidecar restarts, the same as the existing job stores.
- **Snapshot memory:** the ID snapshot holds every GUID in memory. That is acceptable up to a few million IDs; consider a hard cap.
- **Open questions for the Dataverse review:** confirm the "Execute Workflow Job" privilege, how an empty `ExecuteMultiple` behaves, and whether to set `ReturnResponses = true` to capture the `asyncoperation` IDs for linking to system jobs.

**Blockers and ambiguity**
- No hard blockers. Nothing in Power Tools already covers this job.
- XrmToolBox catalog metadata (including the open-source flag) is unverified because of the egress block.
- The repository license is unverified via the GitHub API. The clone has no LICENSE file.

**Files**
- Plugin source (scratchpad clone): `/tmp/claude-0/-home-user-PowerTools/5f42da65-92a1-5e94-9b28-8d61bce6baa8/scratchpad/bwe/XrmToolBox - Bulk Workflow Execution 2015/BulkWorkflowExecution.cs` and `.../Plugin.cs`
- Power Tools references:
  - `/home/user/PowerTools/desktop/src/ui/tools/registry.tsx`
  - `/home/user/PowerTools/desktop/src/ui/tools/publicCatalog.ts`
  - `/home/user/PowerTools/api/PowerTools/PowerTools.API/Program.cs`
  - `/home/user/PowerTools/api/PowerTools/PowerTools.API/Tools/Fetch/FetchXmlPaging.cs`
  - `/home/user/PowerTools/api/PowerTools/PowerTools.API/Services/MigrationJobRunner.cs`
  - `/home/user/PowerTools/api/PowerTools/PowerTools.API/Tools/SolutionComponentsMover/SolutionComponentsMoverEndpoints.cs`
- Brief destination for the pipeline (not written by me): `/home/user/PowerTools/desktop/docs/tools/bulk-workflow-execution/brief.md`
