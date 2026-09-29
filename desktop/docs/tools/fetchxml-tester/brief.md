### Match

- **Plugin:** FetchXml Tester, by MscrmTools
- **Catalog:** https://www.xrmtoolbox.com/plugins/MscrmTools.FetchXmlTester/
- **NuGet:** `MscrmTools.FetchXmlTester` 1.2025.3.29 (28 Mar 2025). Description: “Test your FetchXml queries”. Tags: `XrmToolBox`, `FetchXml`. Depends only on `XrmToolBox >= 1.2016.11.4`. Open source. Latest release note: “Added support for XML comments when formatting XML”.
- **Source:** https://github.com/MscrmTools/MscrmTools.FetchXmlTester (default branch `master`, commit `77f2d3a`, “Remove encoding for XML comment value”). NuGet `projectUrl` points at this repo.
- **License:** GNU GPL 3.0 for the plugin. `AppCode/XMLViewer.cs` and `AppCode/CharacterEncoder.cs` are an embedded Microsoft RichTextBox sample under the Microsoft Public License (Ms-PL). Power Tools is MIT. Treat this as inspiration only: do not copy source, the RTF highlighter, icons, or wording.
- **Related:** FetchXML Builder (`Cinteros.Xrm.FetchXmlBuilder`, Jonas Rapp) is the visual builder already shipped as `fetchxml-builder`. It is not the behavior to copy here.
- **Confidence:** High. Catalog, NuGet, and the repository agree, and the comment-formatting release note is present in `XMLViewer.ProcessElement`.

### What it does

The plugin is a single-shot FetchXML runner plus a saved-query list. It does not build queries from metadata.

- Edit raw FetchXML. The editor opens on `<fetch mapping="logical"><entity name="account"><attribute name="name" /></entity></fetch>`.
- Format that XML, including comments that sit inside an element (version 1.2025.3.29).
- Execute the editor text once. Empty text is blocked before any call.
- Show a grid of returned attributes and the line `Number of rows returned: N (More records: true|false)`.
- Toggle **Show Formatted Values**. Off by default. The choice is applied only on the next execute; flipping it does not redraw the current grid.
- Save the current query with a free-text description into a local library. Double-click a row to load it. Delete, reload, and search by table, description, FetchXML, or environment. **All Envs.** shows every saved file; otherwise only the current XrmToolBox connection. Columns are Table, Date, Environment.

### Backend findings

There is one Dataverse call, and no metadata, paging loop, batch, retry, or privilege pre-check.

**Execute.** `Service.RetrieveMultiple(new FetchExpression(editorText))`. That is SDK `RetrieveMultiple` with a `FetchExpression` whose `Query` is the raw string. No `QueryExpression`, no Web API, no `ExecuteMultiple`, no `WhoAmI`, no impersonation.

```178:204:/tmp/FetchXmlTester/MsCrmTools.FetchXmlTester/FetchXmlTester.cs
        private void ProcessFetchXml()
        {
            WorkAsync(new WorkAsyncInfo
            {
                Message = "Executing request...",
                AsyncArgument = txtRequest.Text,
                Work = (bw, e) =>
                {
                    var response = Service.RetrieveMultiple(new FetchExpression(e.Argument.ToString()));
                    e.Result = response;
                },
                // ...
                lblCountResult.Text = $"Number of rows returned: {((EntityCollection)e.Result).Entities.Count} (More records: {((EntityCollection)e.Result).MoreRecords})";
```

The call does not read `PagingCookie` or `TotalRecordCount`. `page`, `count`, `paging-cookie`, `top`, `distinct`, `aggregate`, `returntotalrecordcount`, `no-lock`, and `mapping` are whatever the user typed. Dataverse still caps a page at 5,000 and sets `MoreRecords` when more rows exist. The plugin never issues a second page. An aggregate fetch returns aliased aggregate rows and usually `MoreRecords = false`. A `paging-cookie` value must already be XML-escaped in the editor; the plugin does not encode it.

**Cell values.** Columns are the distinct `Attributes` keys, sorted A–Z. An empty `EntityCollection` yields a table with no columns. Aliased link-entity values stay under their alias key; only the cell is unwrapped.

```111:157:/tmp/FetchXmlTester/MsCrmTools.FetchXmlTester/FetchXmlTester.cs
            var attributeNames = ec.Entities.SelectMany(e => e.Attributes.Select(a => a.Key)).Distinct().OrderBy(a => a).ToList();
            // ...
            dRow[colName] = tsbShowFormatted.Checked
                ? (entity.FormattedValues.Contains(colName) ? entity.FormattedValues[colName] : GetValue(...))
                : GetValue(...);
        // GetValue:
        // EntityReference -> Id string
        // OptionSetValue -> numeric Value
        // Money -> decimal Value
        // OptionSetValueCollection -> comma-joined numeric values
        // AliasedValue -> unwrap and repeat
        // anything else (string, bool, DateTime, int, Guid) -> as returned
```

Formatted mode prefers `FormattedValues` for every attribute that has one (lookup name, option-set label, money, date, boolean “Yes”/“No”, multi-select labels). Raw mode never uses that dictionary. There is no synthetic `id` column; the primary key appears only when the fetch selects it.

**Privileges and errors.** The caller needs read access to the root entity and any linked entities. The plugin does not check this. `RetrieveMultiple` faults surface as `e.Error.Message` only (no hex error code). Empty editor text never calls Dataverse. Invalid FetchXML is sent as-is and fails at the server. Format failures are separate and local: `XmlException` becomes “Please check the input Xml…”, and any namespaced element throws “This viewer does not support the Xml file that has Namespace.”

```208:217:/tmp/FetchXmlTester/MsCrmTools.FetchXmlTester/FetchXmlTester.cs
            if (txtRequest.Text.Length == 0)
            {
                MessageBox.Show(this, @"Please provide a fetchXml query before trying to execute it!", ...);
                return;
            }
            ExecuteMethod(ProcessFetchXml);
```

**Query library (not Dataverse).** Files live under `{XrmToolBox SettingsPath}/FetchXmlTester/{connectionId}_{table}_{yyyyMMdd-HHmmss}.xml`. `connectionId` is the XrmToolBox connection GUID, not the Dataverse organization id. The table name is `//entity/@name`. The file body is indented XML with two comments inserted before the root: `<!--Description:{text}-->` and `<!--Environment:{connectionName}-->`. Those comments are metadata. On load they are stripped, and the editor receives only the fetch element, so they are not executed.

```16:23:/tmp/FetchXmlTester/MsCrmTools.FetchXmlTester/AppCode/QueryInfo.cs
        public QueryInfo(string fetchXml)
        {
            var x = new XmlDocument();
            x.LoadXml(fetchXml);
            Table = x.SelectSingleNode("//entity").Attributes["name"].Value;
            FetchXml = PrintXML(fetchXml);
            Date = DateTime.Now;
        }
```

```136:154:/tmp/FetchXmlTester/MsCrmTools.FetchXmlTester/AppCode/QueryInfo.cs
        internal void Save(ConnectionDetail detail)
        {
            // ...
            filename = ... $"{detail.ConnectionId}_{Table}_{Date:yyyyMMdd-HHmmss}.xml";
            doc.InsertBefore(doc.CreateComment($"Environment:{detail.ConnectionName}"), doc.ChildNodes[0]);
            doc.InsertBefore(doc.CreateComment($"Description:{Description}"), doc.ChildNodes[0]);
            sw.WriteLine(PrintXML(doc.OuterXml));
        }
```

Save replaces the first library row whose formatted XML equals the new query. Closing the tool re-stamps a matching visible row with the current connection. Load failures are swallowed. `PrintXML` swallows `XmlException` and returns `""`.

Failure modes to avoid copying:

- Filename split on `_` breaks when the logical name contains an underscore (`new_custom` makes the timestamp parse fail).
- Description and environment are split on the first colon, so extra colons are dropped.
- A null description throws when filtering (`Description.ToLower()`).
- Save throws if `//entity/@name` is missing (`NullReferenceException`).
- `XmlDocument.LoadXml` has no XXE guard.
- “All environments” plus close-rewrite can move a query onto the connection that is active at close.

**Format.** The Format button is local. `XMLViewer.Process(true)` parses with `XDocument.Parse`, indents four spaces, and emits child `XComment` nodes. Comments that are siblings of `<fetch>`, comments in an element that has no child elements, processing instructions, and namespaces are dropped or rejected. This file is Ms-PL. Do not port it. `QueryInfo.PrintXML` is a second, two-space formatter used only for save and equality.

**Keep:** verbatim `RetrieveMultiple` + `FetchExpression`; one page; `MoreRecords` and row count; alphabetical attribute columns; formatted-vs-raw mapping, including multi-select and aliased values; a local library with description, environment, search, delete, and an all-connections view; comment-preserving format.

**Leave behind:** WinForms, RTF highlighting, XrmToolBox settings files, the underscore filename scheme, comment-embedded metadata, close-to-resave, thread abort for search, and the two different indenters.

### How this differs from FetchXML Builder

| | FetchXML Builder (`fetchxml-builder`) | FetchXML Tester |
| --- | --- | --- |
| Source of the query | Filter tree plus metadata (entities, attributes, relationships, operators, lookups) | The user’s XML |
| Execute | `POST /api/fetch/execute` injects `page`, `count` (max 250), optional `paging-cookie` and `returntotalrecordcount` | One `RetrieveMultiple` of the exact string. No injected paging |
| Pages | Client walks cookies, 50 rows per page | Shows `MoreRecords` only |
| Cells | Option-set and boolean labels; lookups as `{id, name, logicalName}`; extra `id` column | Whole-grid formatted or raw toggle; no extra `id` column |
| Library | None | Description, environment, search, all connections |
| Format | `formatFetchXml` splits on tags and does not keep comments | Must keep XML comments |

Builder stays the place to compose queries. Tester is the place to paste, format, run, and store a query as written, including aggregates, `top`, manual cookies, and comments.

### Power Tools mapping

Reuse `POST /api/fetch/execute`, `DataverseContextFilter`, `DataverseClientFactory`, and `DataverseErrorFormatter`. Do not add a second execute route, a metadata call, or `X-Target-*`. The current handler always rewrites paging in `FetchXmlPaging.Apply` and always formats option-sets and booleans, so the tester cannot call it as-is.

Extend `ExecuteFetchRequest` with two optional fields. Defaults must keep today’s builder behavior.

- `preserveFetchXml` (bool, default `false`). When `true`, XXE-parse with `DtdProcessing.Prohibit` and `XmlResolver = null`, require root `<fetch>` and a child `<entity>`, then `RetrieveMultipleAsync(new FetchExpression(originalString))`. Do not re-serialize, and do not set `page`, `count`, `paging-cookie`, or `returntotalrecordcount`. When `false`, keep `FetchXmlPaging.Apply`.
- `valueMode` (string, default `"builder"`). `"builder"` is the current formatter, including the synthetic `id` column. `"formatted"` uses `FormattedValues` when present, otherwise the raw scalar, and does not add `id`. `"raw"` uses the `GetValue` mapping above and does not add `id`. Both tester modes still unwrap `AliasedValue` and join `OptionSetValueCollection` with commas. Unknown values become strings so the JSON response stays serializable.

Response shape stays `{ records, columns, columnTypes, moreRecords, pagingCookie, totalEstimate }`. For a verbatim call, `totalEstimate` stays null unless the user’s XML set `returntotalrecordcount`. Surface `pagingCookie` as read-only text so the user can paste it back into the fetch. The plugin discards it; showing it does not add a second request.

No new sidecar endpoints. Query history is not Dataverse data. The desktop bridge has no general file store, so keep the library in tool-local `localStorage`. No new Electron IPC.

**New activity-bar tool**

- Id: `fetchxml-tester`
- Title: `FetchXML Tester`
- Tooltip: `Run FetchXML as written and keep a query library`
- Folder: `desktop/src/ui/tools/fetchxml-tester/`
  - `tool.ts` via `defineTool`, `allowMultipleInstances: true`, `showInActivityBar: true`
  - `index.tsx`
  - `components/QueryEditor.tsx`, `QueryLibrary.tsx`, `ResultsPanel.tsx`
  - `model/types.ts`, `model/formatXml.ts`, `model/queryLibrary.ts`
  - `api/useRunFetch.ts` calling `apiPost` with `meta.connectionName`
  - `tests/` for format, library, and execute payload
- Register once in `desktop/src/ui/tools/registry.tsx`.
- Connection UI through `useConnections` / `useConnectionSelection`. Status through `useToolStatus` (row count and `MoreRecords`).
- Do not import `fetchxml-builder` files. A private results grid is required because the builder grid pages and opens records. Do not promote the execute contract to `shared/` unless a later tool needs the same type.

Library record: `{ id, table, description, environment, connectionName, fetchXml, savedAt }`. `table` comes from the first `entity/@name`. Scope the default list to the selected connection name; **All environments** lists every saved record. Search is a case-insensitive contains over table, description, XML, and environment. Dedup on normalized XML, stored as fields rather than comments, so colons and underscores are safe. Description is not written into the XML that gets executed.

### Recommended implementation

1. **Contract.** Add `preserveFetchXml` and `valueMode` to `ExecuteFetchRequest` with the defaults above. In `FetchEndpoints`, branch before `FetchXmlPaging.Apply`. Verbatim mode sends the original string to `FetchExpression`. Add raw and formatted cell mapping, including `OptionSetValueCollection` and `AliasedValue`, without an `id` column. Keep XXE rejection and the `<fetch>` / `<entity>` checks. Map faults through `DataverseErrorFormatter` (message plus `0x` error code). Add sidecar tests: builder requests still get `page`/`count`; verbatim requests do not; formatted lookup uses `FormattedValues`; raw lookup is the GUID; multi-select joins with commas; aliased values unwrap; XXE and a missing `<entity>` still return 400.

2. **Tool module.** Add `desktop/src/ui/tools/fetchxml-tester/` with the manifest above. Editor starts from the account sample. Execute posts `{ fetchXml, preserveFetchXml: true, valueMode }` and ignores `page` / `pageSize`. Block empty XML in the client. Format with a new comment-preserving indenter written for this repo (two-space indent is enough). Reject invalid XML locally. Do not copy `XMLViewer`.

3. **Results.** Grid of `columns` in returned order. Status text: row count and `MoreRecords`, plus the paging cookie when present. The formatted toggle is sent on the next execute. Do not auto-page and do not call metadata.

4. **Library.** `localStorage` helpers: save, load, delete, search, current-connection vs all connections. Saving requires a parseable `entity/@name`. Replacing a duplicate updates that record in place.

5. **Registry.** Import the tool in `desktop/src/ui/tools/registry.tsx` next to `fetchXmlBuilderTool`.

6. **Tests.** Renderer tests for comment-preserving format, library dedup, empty-execute guard, and the verbatim request body. From `desktop/`, `npm test`, `npm run lint`, and `npm run build`.

**Risks.** Verbatim fetches can return 5,000 rows; do not clamp `count` in this mode. Aggregate and aliased columns must be shown under the keys Dataverse returns. `FormattedValues` exist only for some attributes and follow the user’s Dataverse formats. GPL 3.0 and Ms-PL code stays out of this MIT repo.

### UX

**Placement.** Sidebar title is `FetchXML Tester`. Tooltip is `Run FetchXML as written and keep a query library`. That tooltip is the activity-bar button `title` and accessible name. The entry sits in the tool list under the existing “Search tools” field in `ActivityBar.tsx`. Choosing it opens one tab titled FetchXML Tester. The shell status bar shows whatever the tool publishes with `useToolStatus`. The tool does not create or manage status ids.

No title-bar menu item. `titleBarMenus.ts` exposes only File, Edit, View, and Help, and those buttons open the existing application menus. Format, execute, save, and library actions stay in the tab. The standard Edit menu already covers undo, cut, copy, and paste in the editor.

**In-tab flow.** One surface, three stacked regions, on `bg-[var(--color-bg-dark)]`.

1. Editor. A plain monospace textarea owned by the tool, not a new shared control. It opens on `<fetch mapping="logical"><entity name="account"><attribute name="name" /></entity></fetch>`. Style it with `bg-[var(--color-bg-darker)]`, `text-[var(--color-text-white)]`, `border-[var(--color-border-dark)]`, and `focus:border-[var(--color-primary)]`. The action row is:
   - `Button` variant `secondary`, label Format. Reindent the editor text and keep comments that sit inside an element. Invalid XML shows an error toast and leaves the text unchanged.
   - `Button` variant `primary`, label Execute. Run the editor text once. Disabled while the editor is empty or a run is in flight, so empty text never starts a call.
   - `Checkbox` labeled Show formatted values, unchecked by default. Label text is `text-[var(--color-text-gray)]`. Changing it does not redraw the current grid. The next Execute uses the new value.
   - `Button` variant `secondary`, label Save. Opens the save modal when the editor is not empty.
2. Results. `DataTable` whose columns are the returned attribute names, in the order they come back. No extra id column and no row action that opens a record.
3. Library. Queries saved locally with this tool, not a Dataverse list and not a file dialog.
   - `SearchInput` placeholder `Search saved queries`. Match is case-insensitive contains over table, description, FetchXML, and environment.
   - `Checkbox` labeled All environments, off by default. Off shows queries for the connection already selected in the shell. On shows every saved query. The activity-bar connection footer stays the connection UI.
   - `Button` variant `secondary`, label Reload. Re-reads the local library.
   - `DataTable` columns Table, Date, and Environment. Description is stored and searched, and is not a column. `onRowClick` loads that FetchXML into the editor and does not execute it. A `Button` variant `ghost`, label Delete, on the row removes that query and does not load it.

**Save.** `Modal` title `Save query`. The body is a plain textarea for the free-text description, using the same color variables as the editor. An empty description is allowed. `Button` variant `primary`, label Save, stores the current editor text, closes the modal, and adds the row to the library list that matches the environment filter. `Button` variant `secondary`, label Cancel, closes without writing. Do not add a shared text field.

**States.**

- Loading. Show `Spinner` beside Execute. Disable Format, Execute, and Save. Publish `Running FetchXML…` with `useToolStatus`. Keep the previous grid visible. Do not use `ProgressBar`.
- Empty editor. Execute and Save stay disabled. The results region stays on its empty state until a run succeeds.
- Empty results. A successful run with no rows still publishes `Number of rows returned: 0 (More records: false)` with `useToolStatus`. When the result has no columns, show that message in the results region instead of a headerless table. When columns exist and there are no rows, `DataTable` uses `emptyMessage` `No rows returned`.
- Empty library. `DataTable` `emptyMessage` is `No saved queries`. A search with no hits uses `No matching queries`.
- Success. Replace the grid with the returned attributes. Publish `Number of rows returned: N (More records: true|false)` with `useToolStatus`, using the count and flag from that run. Saving uses `useToast` type `success` with `Query saved`.
- Error. An execute failure uses `useToast` type `error` with the failure message, and leaves the editor, the last grid, and the previous status text unchanged. A format failure uses `useToast` type `error` and does not change the editor. Delete and reload failures use `useToast` type `error`. Do not add an inline error color. Toast already styles `error`, and the palette has no separate error variable.

**Shared controls.** `Button`, `Checkbox`, `DataTable`, `Modal`, `SearchInput`, `Spinner`, and `Toast` through `useToast`.

**Colors.** Tool-owned surfaces use only existing variables: `bg-[var(--color-bg-dark)]` for the tab, `bg-[var(--color-bg-darker)]` for the editor and description field, `bg-[var(--color-bg-light)]` for a secondary strip if one is needed, `text-[var(--color-text-white)]` for editor text, `text-[var(--color-text-gray)]` for labels, `text-[var(--color-text-dark-gray)]` for empty and placeholder text, `border-[var(--color-border-dark)]` for dividers, `hover:bg-[var(--color-hover-bg)]` for hover on tool-owned rows, and `border-[var(--color-primary)]` or `text-[var(--color-primary)]` for focus. No hex values.

**What not to build.**

- A File, Edit, View, or Help item for this tool.
- A metadata query builder (entities, attributes, relationships, operators, or lookups). This tool does not build queries from metadata.
- Paging controls, next page, page size, or a follow-up request. One execute fills the grid, and More records is status text only.
- Opening a record from the grid, a synthetic id column, or redrawing cells when Show formatted values changes.
- `ProgressBar`, a shared text input, a code editor, a syntax highlighter, or an RTF view.
- WinForms layout, XrmToolBox host chrome, plugin icons, or plugin dialog wording.
- A connection picker inside the tab, a file dialog, or a new Electron IPC channel for the library.
- A new sidecar endpoint or request shape. This screen edits text, runs it once, and stores queries locally.

### Dataverse review

Evidence is the current Microsoft Learn FetchXML and SDK contract (page results, select columns, aggregate data, count rows, filter rows, retrieve data, query data, the `fetch` element reference, `RetrieveMultipleRequest`, and service-protection limits), plus the existing `POST /api/fetch/execute` path: `RetrieveMultipleAsync(new FetchExpression(...))` through `DataverseClientFactory`. Plugin source is not treated as the message contract.

#### Messages, metadata, paging, and batching

The message is `RetrieveMultiple`. The SDK request is `RetrieveMultipleRequest` whose `Query` is a `FetchExpression`; `FetchExpression.Query` is the fetch string. `IOrganizationService.RetrieveMultiple` is the same message. Verbatim mode has to pass that original string through. Re-serializing it, or converting it with `FetchXmlToQueryExpressionRequest`, drops FetchXML-only behavior. Microsoft documents that conversion to `QueryExpression` loses capabilities QueryExpression does not have, including the per-query `aggregatelimit`.

No metadata message is required. Column and table names in the fetch are logical names. Omitting every `attribute`, or sending `all-attributes`, returns every column and is the documented timeout risk. A null value is absent from `Entity.Attributes`, so a selected column that is null on every returned row never appears in the key set. `AttributeCollection` order is not a documented order.

Paging, from [Page results using FetchXML](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/fetchxml/page-results):

- The default and maximum page size is 5,000 rows for standard tables and 500 for elastic tables. Omitting `count` still returns at most that page, with `MoreRecords` set when more rows match. The 5,000 figure in the brief is the standard-table cap only.
- `top` cannot exceed 5,000 and is incompatible with `page`, `count`, and `returntotalrecordcount`. `top` is a different limit from paging.
- Cookie paging sets `paging-cookie` to the previous page’s cookie and increments `page`. The cookie is opaque. Simple paging (`page` and `count` only) cannot return a set larger than 50,000 rows.
- Some queries return no cookie. The documented example is an order on a `link-entity` attribute. `MoreRecords` can still be true, and the query then uses simple paging, including the 50,000-row ceiling.
- With no `order`, FetchXML adds primary-key order. `distinct="true"` results do not include primary-key values, so a distinct query needs its own order or pages are not stable. A non-unique order can repeat or skip rows across pages.
- The SDK `EntityCollection.PagingCookie` is raw cookie XML. Microsoft’s SDK sample assigns it with `XElement.SetAttributeValue`, which XML-encodes it. The Web API annotation is a different string: URL-decode the `pagingcookie` value twice, then XML-encode it. This execute path is the SDK, so the response cookie is the SDK string. Pasting that string into an attribute without encoding makes the fetch XML ill-formed. A cookie the user already encoded must be left as typed; encoding it again targets a different cookie. `page` has to advance with the cookie.

`returntotalrecordcount="true"` fills `TotalRecordCount` only up to 5,000 for standard tables and 500 for elastic tables, and sets `TotalRecordCountLimitExceeded` when the match set is larger. When the attribute is absent, `TotalRecordCount` is -1. A `totalEstimate` of 5000 (or 500 on an elastic table) is the cap, not proof that the match set ends there, unless `TotalRecordCountLimitExceeded` is false. The current response shape omits that flag. `RetrieveTotalRecordCount` is a different message (unfiltered snapshot, up to about 24 hours old) and is not this execute.

Aggregate FetchXML is not a paged row query. Each aggregated `attribute` needs an `alias`. The source set is limited to 50,000 records. Above that, the fault is `AggregateQueryRecordLimit exceeded. Cannot perform this operation.` (`-2147164125`, `0x8004E023`). `aggregatelimit` can only lower that ceiling; the query then aggregates at most `limit + 1` arbitrary rows and does not raise that fault. Grouped results are one row per group under the alias keys. “Usually `MoreRecords = false`” is not the documented outcome.

Link and alias keys, from the `link-entity` reference and [Select columns using FetchXML](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/fetchxml/select-columns):

- An attribute `alias` becomes the key, and the value is an `AliasedValue` (`EntityLogicalName`, `AttributeLogicalName`, `Value`).
- A link-entity attribute without its own alias is `{alias or logical name}.{column}`. If the link has no alias, Dataverse generates `{LogicalName}{N}` (`N` starts at 1) so names stay unique. That generated alias cannot be referenced elsewhere in the fetch.
- `link-type` defaults to `inner`. `matchfirstrowusingcrossapply` returns schema names without the alias prefix.
- `AliasedValue.Value` can itself be an `EntityReference`, `OptionSetValue`, `Money`, or `OptionSetValueCollection`.

`FormattedValues` on the SDK path is populated without a Web API `Prefer` header. Web API formatted values, paging cookies, and `morerecords` require annotations and a different cookie encoding, so verbatim execute has to stay on `FetchExpression`. Formatted strings follow the caller’s language, format, and time zone. Booleans use the localized `TrueOption` / `FalseOption` labels. Lookups use the primary name. Money includes currency formatting. Dates depend on the column’s behavior (User Local, Date Only, Time-Zone Independent), the organization settings, and the user’s personal options. Choice and multi-select formatted values are one label string per attribute. The comma-joined integers are the plugin’s raw `OptionSetValueCollection` mapping, not that formatted string.

Raw SDK values that the plugin mapping narrows:

- Lookup: `EntityReference` carries `Id`, `Name`, and `LogicalName`. Keeping only `Id` drops the name and the target type. `Name` can be set when `FormattedValues` is empty; a fallback that then uses the GUID drops that name.
- Money: `Money.Value` is the decimal. Currency id and precision are separate.
- User Local date values are UTC on the wire. The formatted string is the caller-facing value.

One execute is one `RetrieveMultiple`. `ExecuteMultiple` allows up to 1,000 operations and is not a transaction. `ExecuteTransaction` does not apply to this read. There is no partial-success collection on a single retrieve. A 5,000-row page counts as one request toward online service protection, and its duration counts toward the execution-time budget.

The current public `fetch` attributes are `aggregate`, `aggregatelimit`, `count`, `datasource`, `distinct`, `latematerialize`, `no-lock`, `options`, `page`, `paging-cookie`, `returntotalrecordcount`, `top`, and `useraworderby`. `no-lock` is documented as a legacy hint that is no longer necessary. `options` passes SQL hints and is documented for Microsoft support use. `datasource="retained"` selects long-term retention rows. `latematerialize` and `useraworderby` change query execution, not the privilege model.

#### Privileges and connection requirements

`RetrieveMultiple` requires read privilege on every table in the query, including linked tables, and read access on the rows that come back. Rows the caller cannot read are omitted. Column values the caller cannot read, including column-level security, are omitted. A missing table privilege faults the whole call. A pre-check cannot reproduce row, team, business-unit, hierarchy, or column security. Shared access changes the row set without changing the fetch.

The caller is the connection user. Online uses that user’s delegated token. On-premises uses the SOAP organization user. `WhoAmI` is not an argument of this message. Impersonation (`CallerId` / `MSCRMCallerID`) requires `prvActOnBehalfOfAnotherUser` and is a different caller. This execute path does not set it.

#### Online versus on-premises

The message and `FetchExpression` string are the same on both. Online uses `ServiceClient` with the bearer token. On-premises uses `Organization.svc`. Power Tools already rejects HTTP on-premises URLs.

Online service protection applies per user, per web server: 6,000 requests in 300 seconds (`-2147015902`, `0x80072322`), 1,200 seconds of combined execution time in that window (`-2147015903`, `0x80072321`), and 52 concurrent requests (`-2147015898`, `0x80072326`). The SDK fault carries `Retry-After` in `OrganizationServiceFault.ErrorDetails`. The current formatter emits the message and hex code and drops `ErrorDetails`, so the retry delay is lost. These three codes are an online public-API limit. On-premises failures are SQL, IIS, and organization limits.

Elastic tables (500-row pages), `datasource="retained"`, and virtual-table query limits are online features. An on-premises organization faults when the table or attribute is unknown there. `ServiceClient` is documented to wait for `Retry-After` and resend; the on-premises SOAP client does not implement that online retry.

#### Solution and managed limits

`RetrieveMultiple` does not create or edit solution components and does not write a managed or unmanaged layer. Managed tables and columns stay readable when the caller has read privilege. Managed-layer locks block customization changes, not this read.

`savedquery` (system view) is a solution component and `userquery` stores a user’s FetchXML, but this tool neither reads nor writes those tables. The library is local. A fetch copied from a managed view still runs or fails on the caller’s read privilege. Reading `solution` or `solutioncomponent` is the same retrieve and needs read privilege on those tables.

#### Failure modes

- Empty fetch text never reaches Dataverse.
- DTD, XXE, a missing root `<fetch>`, and a missing `<entity>` fail in `FetchXmlPreparation` with HTTP 400. That is a client guard. Semantic errors still reach the server.
- Unknown table or column, illegal operator, aggregate without an alias, a stale or mismatched cookie, and `top` combined with paging or `returntotalrecordcount` are organization-service faults. `DataverseErrorFormatter` adds the `0x` code for `FaultException<OrganizationServiceFault>`.
- More than 500 `condition` and `link-entity` elements faults with `TooManyConditionsInQuery` (`-2147204340`, `0x8004430C`). An `in` value list is the documented way to shrink a condition list. `in` on a string is limited to 850 characters.
- Aggregate source sets over 50,000 records fault with `0x8004E023`, except where `aggregatelimit` silently shortens the set.
- `MoreRecords` true means the grid is one page. `Entities.Count` is the page size, not the match set. A null cookie with `MoreRecords` true is the simple-paging fallback.
- An empty `EntityCollection` is success: zero rows, `MoreRecords` false, no columns.
- Row and column security succeed with a shorter row or column set.
- A long query or `all-attributes` can time out. A socket timeout is formatted as a network message and has no Dataverse hex code.
- One `RetrieveMultiple` has no partial success. `ExecuteMultiple` `ContinueOnError` would be a different message.

#### Plugin claims that are wrong

- “Dataverse still caps a page at 5,000.” Standard tables cap at 5,000. Elastic tables cap at 500. Omitting `count` still returns only one maximum page.
- “An aggregate fetch returns aliased aggregate rows and usually `MoreRecords = false`.” Over 50,000 source records is fault `0x8004E023`. `aggregatelimit` returns an arbitrary subset (`limit + 1`) without that fault. Group rows are alias keys. `MoreRecords` is not the documented aggregate signal.
- Boolean formatted values are “Yes”/“No”. They are the localized boolean option labels.
- “The caller needs read access to the root entity and any linked entities” is only the table-privilege rule. Missing table privilege faults the call. Missing row access omits rows. Column security omits values. The plugin’s message-only error drops the hex code the platform returns.
- “Aliased link-entity values stay under their alias key.” That is true for an attribute alias. Otherwise the key is `{link}.{column}` or a generated `{LogicalName}{N}` alias. `matchfirstrowusingcrossapply` uses schema names without that prefix.
- “The primary key appears only when the fetch selects it.” `distinct="true"` omits primary-key values. The Web API FetchXML example returns the primary key when the fetch does not list it. SDK `Entity.Id` is the row id for an ordinary retrieve.
- `no-lock` is not a documented result switch. The current reference calls it legacy and no longer necessary.
- “Invalid FetchXML is sent as-is and fails at the server.” Well-formedness, DTD, root `<fetch>`, and `<entity>` fail locally on the Power Tools path. Server faults are the semantic ones.
- Showing the SDK paging cookie as text does not make it ready to paste. It still needs XML attribute encoding, and `page` has to increment. Queries with no cookie can still set `MoreRecords`.
- Treating `TotalRecordCount` as the full match set is wrong when `TotalRecordCountLimitExceeded` is true. The cap is 5,000, or 500 for elastic tables.

#### Plugin claims that remain unverified

- Whether SDK `Entity.Attributes` contains the primary key when the fetch does not select it. `Entity.Id` and the Web API payload are documented; the attribute bag is not.
- The exact fault text when `count` or `top` is above 5,000 (500 for an elastic `count`). The published contract is the maximum. Silent clamping is not documented.
- Whether `MoreRecords` is ever true for an aggregate query.
- Whether the organization service ignores XML comments in the executed fetch. Comments are not a documented FetchXML feature. Library description comments stay out of the executed string.
- Whether online rejects `mapping="physical"`, `mapping`, `version`, and `output-format`. Those names are absent from the current `fetch` attribute list. `mapping="logical"` is historical pass-through, not a documented switch.
- The formatted multi-select separator. The platform value is the single `FormattedValues` string.
- Which aggregates, link types, and hints each virtual-table provider or on-premises build rejects. Those fail as server faults for that environment.
- Whether `EntityReference.Name` and `FormattedValues` still match when the primary-name column is column-secured.
