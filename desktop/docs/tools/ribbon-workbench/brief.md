## Ribbon Workbench research brief: Power Tools equivalent

The plugin is closed source. It is not a Silverlight app: an IE WebBrowser control shows a SparkleXrm HTML/JS app served from a localhost HttpListener. The Dataverse logic sits in a server-side plugin assembly that ships inside a managed solution, and the host can also run that plugin in-process. It loads ribbons by exporting the whole solution. It publishes by exporting again, splicing the RibbonDiffXml back in, then ImportSolution (async) followed by PublishAllXml.

**Blockers:** none. Two things are limited:
- **License:** EULA-like terms, not MIT. Use the plugin as inspiration only.
- **Analysis depth:** static metadata only. I read strings and call edges. I did not decompile or execute anything.

**Evidence handling:**
- Files are in `C:\Users\ABDALL~1.NAG\AppData\Local\Temp\claude\D--dev-PowerTools\c4b08f35-eba9-4f7f-8044-af951b1c85d8\scratchpad\ribbonworkbench-pkg\`:
  - `x\` holds the unzipped nupkg.
  - `sol\` holds the unzipped embedded managed solution.
- I used only stateless REA `inspect_managed_*` calls and no `open_binary`. `close_binary` was called anyway and returned null.
- I wrote no repo files.

---

### Match

- **Plugin:** Ribbon Workbench 2016, by Scott Durow (Develop 1 Ltd).
- **Catalog:** https://www.xrmtoolbox.com/plugins/RibbonWorkbench2016/
- **NuGet id:** `RibbonWorkbench2016`. Latest version is 3.1.647.1 (2023-01-09), about 514k downloads in total.
- **Project URL:** https://ribbonworkbench.uservoice.com/
- **Source:** not public. The catalog does not mark it open source.
  - https://github.com/scottdurow/RibbonWorkbench is shown as MIT, but it appears to hold only the README, logo and the "Smart Buttons" add-on solutions (`Develop1SmartButtons/`, `SmartButtonsUCI/`). I could not see file contents to confirm. It is not the workbench source.
- **License:**
  - The nuspec has `requireLicenseAcceptance=true` and `licenseUrl` = http://www.develop1.net/public/page/Download-License.aspx.
  - That page contains only an AS-IS warranty and liability disclaimer. It says nothing about redistribution, modification or reverse engineering.
  - The nuspec says "Copryright 2020 Develop 1 Ltd" (sic).
  - **Treat it as proprietary and inspiration-only.** Do not copy code, ClientUI.js, templates, CSS or icons. Do not ship the managed solution.
- **Related plugins considered:** none needed. Microsoft's modern command designer (`appaction`) in the maker portal is the platform's own successor for modern commands. It is worth noting as context, but it does not replace classic RibbonDiffXml editing.
- **Confidence:**
  - High for the architecture and Dataverse message flow. These come directly from shipped metadata, call edges and literals.
  - Medium for detailed merge semantics. I did not decompile method bodies, so ordering inside methods and constant values are not verified.

### What it does

- Pick an unmanaged solution, which must contain at least one entity. Load the application ribbon and the base ribbons of the solution's entities, plus the RibbonDiffXml held in that solution.
- Show the command bar or ribbon visually: tabs, groups, controls, buttons, flyouts, split buttons and menu sections.
- Edit what the solution customizes:
  - CustomActions, which add buttons, groups or tabs.
  - HideCustomActions.
  - CommandDefinitions, with JavaScriptFunction and URL actions and typed parameters: String, Int, Bool, Decimal, and Crm (PrimaryControl, SelectedControlSelectedItemIds, and so on).
  - EnableRules and DisplayRules, including OR groups and every rule type in the Ribbon schema: FormState, SelectionCount, EntityPrivilege, RecordPrivilege, CustomRule, ValueRule, CommandClientType, OptionSet and others.
  - LocLabels and templates.
- "Customise command": copy an out-of-box command into the solution so it can be overridden.
- Publish: write the diff back into the solution, import it, and publish.
- Validate: report missing rule references ("Could not find display rule {0}").

### Backend findings

Evidence IDs:
- **Host DLL** `Develop1.XrmTBPlugin.RibbonWorkbench2016.dll`, sha256 `f1cf38f7…0691`:
  - artifact: `ev_dfbd47cbe2…`
  - members: `ev_4a0eb6d0ce…`
  - user strings: `ev_6399a8f386…`
- **Plugin DLL** `RWB2016Plugins.dll` (embedded in the managed solution), sha256 `fb1cc394…c9f9`:
  - full members: `ev_dd5c35eb39…`
  - selection of 14 types: `ev_0ba2b17503…`
  - user strings: `ev_583775ddb2…`

#### Observed (shipped-artifact evidence)

**1. Host shape: WinForms, an IE WebBrowser and a localhost web server.** Evidence: `ev_4a0eb6d0ce…`, `ev_6399a8f386…`.
- The plugin class extends XrmToolBox `PluginControlBase` and creates `System.Windows.Forms.WebBrowser`, calling `Navigate` and `set_ObjectForScripting`.
- A `WebServer` class uses `HttpListener` and `TcpListener` (`FreeTcpPort`) on `http://localhost:{port}/`.
- It serves `WebResources/html/EditCommandBar.htm` and the other `rwb_` web resources out of `RibbonWorkbench2016*.zip`. It also serves `_imgs.zip` and `/uclient` assets.
- It synthesizes `clientglobalcontext.js.aspx` by injecting `USER_GUID`, `ORG_UNIQUE_NAME`, `SERVER_URL` and `USE_XRM_BRIDGE = true`.
- **No Silverlight runtime.** The `Develop1.Xrm.Silverlight.*` namespaces are a leftover name. The UI is SparkleXrm/Script# JavaScript: `rwb_/js/ClientUI.js` is 1.4 MB, and the CSS is jQuery UI.

**2. SOAP bridge.** Evidence: `ev_6399a8f386…`.
- `SparkleXrmBridge.Process` parses the SOAP envelopes the JS sends (`//d:request`, `//d:entityName`, `//d:columnSet`, `//a:Query`).
- It forwards them to the XrmToolBox `IOrganizationService` as `Execute`, `Retrieve` or `RetrieveMultiple`, using DataContractSerializer.
- It returns `ExecuteResponse`, `RetrieveResponse` or `RetrieveMultipleResponse` envelopes.
- Errors are formatted as `Exception:ErrorMessage={0}&ErrorCode={1}&ErrorTrace={2}`.
- `WhoAmIRequest` supplies the user id.

**3. Server logic runs as a custom action plus plugin, and can also run in-process.**
- The managed solution (`sol\customizations.xml`, `sol\solution.xml`, `sol\Workflows\CustomiseRibbon-*.xaml`) contains:
  - custom action `rwb_CustomiseRibbon` (Workflow Category 3, PrimaryEntity none), with inputs `Operation` and `Data` (JSON) and output `Result` (JSON);
  - plugin types `RWB2016.Plugins.RibbonCustomisationsPlugin` and `SparkleXrm.Plugins.Plugin`, in sandbox isolation mode 2;
  - an SDK message processing step;
  - the `rwb_` web resources;
  - an empty application RibbonDiffXml component.
- The host also has its own `PluginExecutionContext`, `ServiceProvider`, `TracingService` and `OrganizationServiceFactory`, plus `SparkleXrmBridge.GetPluginFromStream`. Evidence: `ev_4a0eb6d0ce…`.
  - It references `Assembly.Load`, `Activator.CreateInstance` and `IPlugin.Execute`.
  - Strings include `rwb_CustomiseRibbon` and `RWB2016.Plugins.RibbonCustomisationsPlugin`.
  - This means it can run the plugin locally against the XrmToolBox connection, so the managed solution does not have to be installed.
- **Operations dispatched in `RibbonCustomisationsPlugin.Execute`** (`ev_583775ddb2…`): `UpdateToVersion`, `LoadSolution`, `GetSolutionDetails`, `LoadRibbonXml`, `GetSolutionJSON`, `GetRibbonJSON`, `CustomiseCommand`, `GetRibbonXml`, `PublishSolution`.

**4. Solution lookup.** Evidence: `ev_583775ddb2…`, call edge `GetSolutionRecord -> IOrganizationService.RetrieveMultiple(FetchExpression)`.
- FetchXML on `solution` returns `friendlyname`, `uniquename` and `solutionid`.
- It inner-joins `publisher` to get `customizationprefix`, filtered on `uniquename eq {0}`.
- If nothing comes back, the error is "Solution {0} not found".
- The publisher prefix is used when generating ids for new elements. Params are `solutionPrefix` and `ribbonDefinitionXml`.

**5. Load: `DownloadSolutionController`.** Evidence: `ev_0ba2b17503…` call edges and `ev_583775ddb2…`.
1. `ExportSolutionRequest { SolutionName }`. Only SolutionName is set, so Managed=false by default and the export is unmanaged.
2. Unzip `ExportSolutionFile` with `System.IO.Packaging`. Read `customizations.xml` and `solution.xml`. Failure: "Could not find customizations.xml in exported solution zip".
3. Read `solution.xml` RootComponents (`ImportExportXml/SolutionManifest/RootComponents/RootComponent`) and compare the type attribute against the literals "31", "90", "91", "92", "93". This feeds `set_ContainsNonRibbonComponents`.
4. Parse `ImportExportXml/Entities/Entity` (by `Name`) and `ImportExportXml/RibbonDiffXml` (the application ribbon).
   - A missing diff defaults to `<RibbonDiffXml/>`.
   - `RibbonDiffXml/RibbonNotSupported` marks entities without ribbon support.
   - A hard-coded entity list appears near this logic: queue, savedquery, workflow, organization, businessunit, transactioncurrency, annotation, duplicaterule, fieldsecurityprofile, and others.
   - If the solution has no entities: "Solution does not contain any entities! ... When you publish, the same solution is edited and re-uploaded."
5. Base ribbons:
   - `RetrieveApplicationRibbonRequest`, reading `CompressedApplicationRibbonXml`.
   - Per entity: `RetrieveEntityRibbonRequest { EntityName, RibbonLocationFilter }`, reading `CompressedEntityXml`.
   - Each compressed payload is a zip holding `RibbonXml.xml`. Failure: "Could not find RibbonXml.xml in exported ribbon zip".

**6. Publish: `PublishSolutionController`.** Evidence: `ev_0ba2b17503…` call edges and `ev_583775ddb2…`.
1. `Run` builds a fresh `DownloadSolutionController.DownloadSolution`, which re-exports the solution.
2. `Zip`:
   - Opens the exported package.
   - For each edited entity, selects `ImportExportXml/Entities/Entity[translate(Name,'ABC…','abc…')='{0}']/RibbonDiffXml`. The name match is case-insensitive.
   - Calls `ReplaceWith` with the new diff. The key `applicationribbon` targets the root `RibbonDiffXml`.
   - Error: "Cannot find Entity {0} in the solution. It must have been removed since initially downloading into Ribbon Designer".
   - Writes `/customizations.xml` back and re-zips.
3. `AmmendAndPublish` sends `ImportSolutionRequest { CustomizationFile, ImportJobId = Guid.NewGuid(), OverwriteUnmanagedCustomizations, PublishWorkflows }`, wrapped in `ExecuteAsyncRequest`, and reads `AsyncJobId`.
   - The exact boolean values are not visible without the method bodies. They are almost certainly true and true.
4. `QueryImportJobStatus` calls `Retrieve("importjob", id, ColumnSet(...))`, reading `data` and `solutionname`.
   - Progress comes from the regex `progress="(?'progress'[0-9.]*)"`.
   - Failure comes from `result="failure" errorcode="…" errortext="…"`. The error text is HTML-unescaped and surfaced as "Your solution could not be imported\nReasons:".
   - Polling uses `Thread.Sleep`.
   - Timeout is 15 minutes: "The import process has timed out after 15 minutes."
5. `OnCompletedImport` sends `PublishAllXmlRequest`, then sleeps briefly.

**7. Merge or "sync" logic in the plugin.** Evidence: `ev_583775ddb2…` trace strings.
- It walks the JSON model and syncs into the RibbonDiffXml in this order: Solution EnableRules, DisplayRules, Commands, Tabs, Groups, Buttons, HideActions.
- It then removes Commands, Buttons, DisplayRules, EnableRules, Groups and Tabs that are "no longer in solution", and saves the XML.
- New groups default to template `Mscrm.Templates.Flexible3` with layout `LargeLargeMedium`.
- "Adding new tabs is not supported".
- Default enable rule is `Mscrm.Enabled`.
- Model JSON uses `__type` discriminators such as `ButtonControl`, `FlyOutAnchorControl`, `SplitButtonControl`, `MenuSectionControl`, `UrlCommandAction`, `JavascriptFunctionCommandAction`, and the `*Parameter` types. Labels are keyed by `LCID`.

**8. XSD-mapped classes.**
- The assembly contains classes generated from the Microsoft RibbonCore/RibbonTypes XSD: `RibbonDiffXmlType`, `CustomActionType`, `CommandDefinitionType`, `EnableRulesType`, `DisplayRulesType`, and every `*RuleType`.
- This means it parses and serializes RibbonDiffXml with strongly typed classes generated from the public schema. Evidence: `ev_dd5c35eb39…` types collection.

#### Inferred (not verified)

- `RibbonLocationFilter` is likely `RibbonLocationFilters.All`, covering Form, HomepageGrid and SubGrid. The value constant was not read.
- The root-component type literals "31" and "90"–"93" are probably used to warn when the solution holds more than entities and ribbon parts. In current Dataverse numbering, 90 = PluginType, 91 = PluginAssembly, 92 = SdkMessageProcessingStep, 93 = SdkMessageProcessingStepImage, and 31 is unclear. The intent is a warning, because re-importing a large solution is slow and risky.
- `ContainsNonRibbonComponents` likely drives the well-known advice to "use a slim solution containing only the entities, with no subcomponents".
- The cloud and local execution paths share the same plugin code. The host prefers in-process execution.

#### Unknown

- The exact ImportSolution flags.
- The poll interval.
- Whether `PublishXmlRequest` is ever used. Only `PublishAllXmlRequest` was observed.
- How "CustomiseCommand" copies an out-of-box command. It probably clones the CommandDefinition from the base `RibbonXml.xml` into the diff, but this is not verified.
- Handling of `<LocLabels>` and `<Templates>` merging.
- Whether `ExecuteMultiple` is used anywhere. It was not observed.

#### Behavior to keep

- Use a slim unmanaged solution as the unit of work. Read entity diffs from an export of that solution.
- Get base ribbons from `RetrieveEntityRibbon` and `RetrieveApplicationRibbon` by unzipping `RibbonXml.xml`.
- Re-export right before publishing, so you do not overwrite concurrent changes, and replace only the `RibbonDiffXml` nodes.
- Match entities case-insensitively.
- Run async import with a client-generated `ImportJobId`, poll `importjob.data` for progress and failure text, and enforce a timeout.
- Run validation that rule ids referenced by commands exist.
- Use the publisher prefix for new ids.

#### Behavior to leave behind

- IE WebBrowser, localhost HttpListener, the SOAP bridge and the fake ClientGlobalContext.
- Installing a managed solution, custom action and plugin into the customer's org.
- In-process `IPlugin` hosting.
- Script#/SparkleXrm.
- Self-update via `UpdateToVersion`.
- `PublishAllXml`. Prefer a targeted `PublishXmlRequest` with `<importexportxml><entities>…</entities><ribbons><ribbon/></ribbons></importexportxml>`, matching the Translator rule "Never PublishAllXml" (`api/PowerTools/PowerTools.API/Tools/Translator/TranslatorClient.cs:177`). Whether the import itself already publishes ribbon changes needs checking by the Dataverse expert.

### Power Tools mapping

- **Not covered by any existing tool.** No ribbon or command-bar tool exists in `D:\dev\PowerTools\desktop\src\ui\tools\registry.tsx` or `D:\dev\PowerTools\desktop\src\ui\tools\publicCatalog.ts`.
- **New activity-bar tool:**
  - id: `ribbon-workbench`
  - title: "Command Bar Editor". Avoid the trademark-like "Ribbon Workbench" name.
  - tooltip: "Edit classic command bar buttons, commands and rules in a solution"
- **Reuse:**
  - The solution-list pattern from `GET /api/solution-components-mover/solutions` and `/api/translator/solutions`. If a third tool needs the same `SolutionInfo` contract, promote it to `desktop/src/ui/shared/contracts`.
  - `GET /api/metadata/entities` for entity display names.
  - The job store, runner and poll pattern from `Tools/Translator/TranslatorJob.cs` and `Tools/SolutionComponentsMover/SolutionCopyJob*.cs`.
  - On the desktop side: `useTabConnection`, `useToolStatus` for import progress, `useOpenInBrowser` to open the solution, and shared UI from `desktop/src/ui/shared/ui`.
- **New sidecar group** in `api/PowerTools/PowerTools.API/Tools/RibbonWorkbench/`, using `DataverseContextFilter` and `DataverseClientFactory`, registered with `app.MapRibbonWorkbenchEndpoints()` in `Program.cs`:

| Method and path | Request | Response | Dataverse call |
| --- | --- | --- | --- |
| `GET /api/ribbon-workbench/solutions` | (none) | `{ id, uniqueName, friendlyName, publisherPrefix, isManaged }[]` | `RetrieveMultiple` on solution joined to publisher, filtered to `ismanaged=false` and `isvisible=true` |
| `POST /api/ribbon-workbench/load` | `{ solutionUniqueName }` | `{ solution, entities: [{ logicalName, ribbonNotSupported, ribbonDiffXml }], applicationRibbonDiffXml, warnings[] }` | `ExportSolutionRequest { Managed = false }`, unzip, parse `customizations.xml` and `solution.xml` with `System.IO.Compression` and XLinq. Warn about non-ribbon root components and fail when there are no entities. |
| `GET /api/ribbon-workbench/base-ribbon?entity=` | `entity` (omit for application) | `{ ribbonXml }` | `RetrieveEntityRibbonRequest { EntityName, RibbonLocationFilter = All }` or `RetrieveApplicationRibbonRequest`, then unzip `RibbonXml.xml` |
| `POST /api/ribbon-workbench/publish` | `{ solutionUniqueName, diffs: { [entityOrApplication]: ribbonDiffXml } }` | `{ jobId }` | Background job: re-export, replace `RibbonDiffXml` nodes case-insensitively, re-zip, then `ExecuteAsyncRequest(ImportSolutionRequest { CustomizationFile, ImportJobId = NewGuid, OverwriteUnmanagedCustomizations = true, PublishWorkflows = false })`. Poll `importjob(data, progress, completedon)`, plus the asyncoperation state. Then `PublishXmlRequest` scoped to the touched entities and ribbons. Timeout 15 minutes. |
| `GET /api/ribbon-workbench/jobs/{jobId}` | (none) | `{ status, progress, phase, errors[] }` | Job store |

- **Keep the RibbonDiffXml model on the sidecar.**
  - Do not generate XSD classes from Develop1. Generate them from Microsoft's public RibbonCore/RibbonTypes XSD, or use XLinq.
  - The renderer edits a typed JSON DTO (`RibbonDiffDto`: customActions, hideCustomActions, commandDefinitions, enableRules, displayRules, locLabels).
  - The sidecar does `POST /api/ribbon-workbench/diff/validate` (missing rule refs, duplicate ids, prefix) and the JSON-to-XML serialization. Validation could fold into publish.
- **Desktop folder** `desktop/src/ui/tools/ribbon-workbench/`, private to the tool:
  - `tool.ts` (`defineTool`)
  - `api/` (react-query hooks using `apiGet`/`apiPost` with `meta.connectionId`)
  - `model/` (diff DTO, merge helpers for "base ribbon + diff → rendered command bar")
  - `components/` (solution picker, entity list, command bar preview, command/rule editors)
  - `tests/`
- Then one entry in `registry.tsx` and one in `publicCatalog.ts`.

### Recommended implementation

1. **Contracts and read-only sidecar first.** Add `RibbonWorkbenchDtos.cs` and the solutions, load and base-ribbon endpoints, with xUnit tests on fixture `customizations.xml` and `RibbonXml.xml` files written by the team, not copied from the plugin. Cover:
   - entity extraction;
   - case-insensitive matching;
   - the `<RibbonDiffXml/>` default;
   - the `RibbonNotSupported` flag;
   - errors for no entities and missing `customizations.xml` or `RibbonXml.xml`.
2. **Diff model.** Build a RibbonDiffXml to/from DTO serializer based on the Microsoft XSD. Round-trip tests must keep unknown elements unchanged, so nothing is lost on save. Add validation for missing EnableRule/DisplayRule references, duplicate ids and the publisher prefix.
3. **Publish job.** Follow the job-store pattern: re-export, splice, ImportSolution via ExecuteAsync with a client `ImportJobId`, poll `importjob`, then a targeted `PublishXml`, with timeout and cancellation. Parse the failure `errortext` from `importjob.data` and surface it. Hand this to the Dataverse expert to confirm:
   - the import flags;
   - whether a scoped PublishXml is enough for ribbons, given that the plugin used `PublishAllXml`;
   - online throttling on `ExportSolution` for large solutions.
4. **Desktop tool, phase 1:** solution picker, entity list, a read-only view of each entity's diff, and a base command-bar tree from the base ribbon XML.
5. **Desktop tool, phase 2:** edit CustomActions, CommandDefinitions, EnableRules, DisplayRules and HideCustomActions with forms, plus "customise command", which copies the base CommandDefinition and its referenced rules into the diff. Publish with progress through `useToolStatus`.
6. **Registry and catalog:** one entry in `registry.tsx`, one in `publicCatalog.ts`, and the website tool page through the normal pipeline.
7. **Tests:** sidecar unit tests for parse, splice and poll-result parsing, plus desktop tests for the model merge and the editors.

**Risks and constraints:**
- Re-importing a whole solution is heavy. Strongly warn when the solution contains non-ribbon components, as the original does.
- Concurrent edits are a risk. Re-exporting before the splice reduces it but does not remove it.
- This covers only the classic ribbon. Modern commands (`appaction`) are out of scope.
- Do not deploy anything into the customer org: no custom action or plugin.
- License: proprietary, inspiration only. Do not reuse ClientUI.js, templates.htm, CSS, images, `_imgs.zip` or the managed solution. Credit "Ribbon Workbench by Scott Durow / Develop 1" in the write-up.

### Dataverse review

**Evidence used:** Microsoft's published message contracts for `ExportSolution`, `ExportSolutionAsync`, `ImportSolution`, `ImportSolutionAsync`, `ExecuteAsync`, `RetrieveEntityRibbon`, `RetrieveApplicationRibbon`, `PublishXml`, and `PublishAllXml`; the `componenttype` choice; the ribbon XSDs (`RibbonCore.xsd`, `RibbonTypes.xsd`, `RibbonWSS.xsd`) in Microsoft's customization schema download; the documented service protection limits; and the existing sidecar rule in `api/PowerTools/PowerTools.API/Tools/Translator/TranslatorClient.cs:177` ("Never `PublishAllXml`"). The researcher's static metadata is evidence of what the plugin *calls*, not proof that the platform *requires* it. I ran nothing against an org. Everything marked "verify" needs an integration check against a test environment before the publish job ships.

#### Messages, metadata, paging, and batching

- **The write path is correct: a solution import is the only supported way to change RibbonDiffXml.** `ribbondiff`, `ribboncustomization`, `ribboncommand`, and `ribbonrule` exist as tables and solution component types (55, 50, 48, 52), but they are internal and not supported for Create or Update. Do not try to write them directly. Reading diffs also has to go through `ExportSolution`. Querying `ribbondiff` is unsupported, even though it might appear to work.
- **`ExportSolutionRequest`:** `Managed` defaults to `false` in the SDK, so the plugin's export is unmanaged, as the researcher says. Set `Managed = false` explicitly anyway, because the Web API action requires it. All the `Export*Settings` flags can stay false: ribbons are carried by the Entity node and the root `RibbonDiffXml`, not by organization settings.
- **The synchronous export can time out on large solutions.** Online exposes `ExportSolutionAsyncRequest`, which returns `AsyncOperationId` and `ExportJobId`. You poll the `asyncoperation`, then call `DownloadSolutionExportDataRequest { ExportJobId }`. Use that path on Online and keep synchronous `ExportSolution` as the on-premises fallback. It also needs a client timeout longer than the default. The plugin used synchronous export only.
- **`RetrieveEntityRibbonRequest`:** `RibbonLocationFilter` is a flags enum with Form = 1, HomepageGrid = 2, SubGrid = 4, and All = 7. The researcher inferred `All`, and that is what the tool needs. `RetrieveApplicationRibbonRequest` takes no arguments. Both return a zip byte array containing `RibbonXml.xml`, which matches the researcher's findings.
- **Correction: what "base ribbon" means.** `RetrieveEntityRibbon` and `RetrieveApplicationRibbon` return the **published, already-merged** ribbon: system definitions plus every managed and unmanaged RibbonDiffXml layer, including the solution being edited. It is not a clean base. This has consequences for the "base ribbon + diff → rendered command bar" merge in `### Power Tools mapping`:
  - Elements that the loaded diff added appear in the retrieved ribbon already. The merge must match by `Id` and replace, never append, or every custom button shows twice.
  - Elements removed by a `HideCustomAction` are expected to be absent from the retrieved ribbon (verify). To let a user un-hide something, the tool has to show the hide action from the diff on its own, not as a node in the tree.
  - Diff changes that are imported but not published are not reflected.
- **`RibbonNotSupported`:** calling `RetrieveEntityRibbon` for an entity without ribbon support returns a fault. Skip any entity flagged `RibbonNotSupported` in the export, and do not call the message for it. Treat the hard-coded entity list the researcher saw as plugin folklore, not a platform list. Trust the export flag and the fault instead.
- **Import flags.** Recommended values for `ImportSolutionRequest`:
  - `OverwriteUnmanagedCustomizations = true`. For an unmanaged import into the same unmanaged solution, the unmanaged layer is overwritten either way, so this flag mostly matters for managed imports. Setting it to true is harmless and avoids surprises.
  - `PublishWorkflows = true`, not `false` as the mapping table proposes. When a solution that contains activated processes is re-imported, those processes are deactivated for the update. They are reactivated only when this flag is true. With `false`, the tool would silently turn off classic workflows, business rules, or actions that happen to be in the solution. The plugin probably used true; the researcher could not confirm the value.
  - `ConvertToManaged = false`, `HoldingSolution = false`, `SkipProductUpdateDependencies = false`. Leave `ComponentParameters` and `SolutionParameters` unset.
  - `ImportJobId = Guid.NewGuid()`, which is correct. Without it there is no `importjob` row to poll.
- **Async import:** `ExecuteAsyncRequest { Request = ImportSolutionRequest }` works on Online and on supported on-premises versions. Online also has `ImportSolutionAsyncRequest`, which returns `AsyncOperationId` and `ImportJobKey`. Either is fine. Pick one and poll both of these:
  - `asyncoperation` (`statecode`, `statuscode`, `message`, `friendlymessage`) as the source of truth for completion: statuscode 30 = Succeeded, 31 = Failed, 32 = Canceled.
  - `importjob` (`progress`, `startedon`, `completedon`, `data`) for percent complete and per-component detail. The `importjob` row may not exist for a short time after submission. Treat "does not exist" during the first polls as queued, not as failure.
- **Parsing `importjob.data`:** the researcher's regex parsing is fragile. Parse it as XML. The root `result` and each component `result` element carry `result="success|warning|failure"` with `errorcode` and `errortext`. Surface warnings as well as failures, because an import can succeed with warnings.
- **Publish: import does not publish.** An unmanaged import leaves ribbon changes unpublished. Publishing is required, which confirms the researcher's question.
  - A scoped `PublishXmlRequest` is the right call. Use `<entities><entity>{logicalname}</entity>…</entities>` for every entity whose diff changed. Publishing an entity publishes its RibbonDiffXml.
  - For the application ribbon, add `<ribbons><ribbon></ribbon></ribbons>`. This is the documented `ParameterXml` element, but verify that it publishes the application diff on a current Online org.
  - Keep the "Never `PublishAllXml`" rule. `PublishAllXml` is what the plugin used, and it is slow and publishes other people's unpublished work.
- **Root component type literals.** The `componenttype` values are 31 = Report, 90 = PluginType, 91 = PluginAssembly, 92 = SdkMessageProcessingStep, and 93 = SdkMessageProcessingStepImage. That fills the researcher's "31 is unclear". Reports and plugin registrations are exactly the components that make a re-import slow and need extra privileges (see below), which supports the "non-ribbon component" warning reading. Do not limit the warning to these five. Warn on any root component that is not an Entity (type 1) or the application ribbon (type 50).
- **Application ribbon requires its component.** The root `RibbonDiffXml` in `customizations.xml` is exported only when the solution contains the Application Ribbons component (type 50, `RibbonCustomization`). If the solution lacks it, do not splice a root diff into the zip: block application-ribbon edits and tell the user to add Application Ribbons to the solution. Whether an import accepts a root diff without the root component is unverified. Do not rely on it.
- **Entity metadata must be included.** An entity added to a solution without its metadata ("Include table metadata" off, `rootcomponentbehavior` 2) may export without a usable `RibbonDiffXml`, or with only a shell node. Verify this. Until then, treat a missing `RibbonDiffXml` under an `Entity` as "not editable in this solution" rather than defaulting to `<RibbonDiffXml/>` and writing it back.
- **Paging and batching:** `ExecuteMultiple` is not relevant and should not be used. The import is one request. The only list query is solutions joined to publisher, which will not approach 5,000 rows, but use the shared paging helper anyway. There is one `RetrieveEntityRibbon` per entity. Fetch these on demand per entity, not all at load, to keep large solutions within limits.

#### Privileges and connection requirements

- Export needs `prvExportCustomizations`, import needs `prvImportCustomizations`, and publish needs `prvPublishCustomizations`. Reading entity ribbons needs metadata read. The tool also needs Read on `solution`, `publisher`, `importjob`, and `asyncoperation` (the caller's own system jobs). In practice that means System Customizer or System Administrator.
- **Import checks every component in the zip, not just the ribbon.** A solution containing plugin assemblies or steps (types 91–93) needs privileges that a System Customizer may lack. Then a ribbon-only edit fails on an unrelated component. This is a second reason for the non-ribbon warning.
- Do not set `CallerId` or impersonate. The import's system job runs as the caller, and impersonation would make the polling of `asyncoperation` and `importjob` and the audit trail misleading. Use `WhoAmI` only to show who is connected. The SOAP bridge's `WhoAmI` use is plugin plumbing that Power Tools does not need.
- Check privileges up front with `RetrievePrincipalAccess` or a privilege check. If the user cannot import or publish, the tool should open read-only rather than fail after a long export.

#### Online versus on-premises

- `ExportSolutionAsync`, `DownloadSolutionExportData`, and `ImportSolutionAsync` are Online features. On on-premises, use synchronous `ExportSolution` and `ExecuteAsync(ImportSolution)`, and probe for the message or catch the "request not supported" fault.
- Online service protection limits are per user, per server, and per 5-minute window: 6,000 requests, 20 minutes of combined execution time, and 52 concurrent requests. One export, one import, and a few ribbon reads are well under the request count. A large synchronous export plus publish can consume a lot of execution time. Handle `429` and fault code `-2147015902`/`-2147015903`/`-2147015898` with `Retry-After` through the shared client. Poll no faster than every 2 to 5 seconds.
- Solution file size is capped on Online, historically at 95 MB. Verify the current number. On-premises, the cap is the org and IIS upload limit. A ribbon-focused slim solution is far below either cap. Warn when the exported zip is large.
- Auth is whatever `DataverseClientFactory` supports. Nothing here needs Web-API-only or SOAP-only messages, but the SDK request types above are the contract. Web API equivalents exist (`ExportSolution`, `ImportSolution`, `ImportSolutionAsync`, the `RetrieveEntityRibbon` function, `PublishXml`) if the sidecar ever moves off the SDK. `ExecuteAsync` has no Web API equivalent.

#### Solution and managed limits

- **Only unmanaged solutions.** Exclude managed solutions, as the mapping already does. Also exclude `Default` and `Active` by unique name, because `isvisible` alone does not hide `Default`. Exporting and re-importing the Default solution would be enormous and wrong.
- **Solution patches** (an unmanaged solution with `parentsolutionid` set): export and re-import of a patch on its own is unverified. Exclude patches in v1, or verify first.
- **Entity managed properties:** if an entity's `IsCustomizable` managed property is false, the import fails for that entity's ribbon changes. Read `EntityMetadata.IsCustomizable` at load and mark those entities read-only.
- **You cannot edit another layer's elements in place.** A `CustomAction` or `CommandDefinition` that a managed solution or the system defines cannot be edited inside it. The supported overrides are:
  1. Redefine a `CommandDefinition` with the **same Id** in this solution's diff. The unmanaged layer wins. This is what "Customise command" must do, and it must copy the referenced `EnableRule` and `DisplayRule` definitions only when it changes them.
  2. Add a `HideCustomAction` for the location, then add a replacement `CustomAction`.
- **Application-level commands:** a `Mscrm.*` command redefined in an entity's diff applies to that entity only. Redefined in the application diff, it applies everywhere. The UI must make the scope explicit. That is UX's call, but the rule is a platform rule.
- **Re-import overwrites the whole entity, not only its ribbon.** Every component in the zip is re-imported: forms, views, and attributes when metadata is included. Any unmanaged change made by someone else between the re-export and the import is overwritten. That window is short but real.
  - Strengthen the researcher's "re-export before splice" with an **optimistic check**: compare each re-exported `RibbonDiffXml` (normalized) with the copy loaded into the editor. If they differ, stop with a conflict instead of silently replacing it.
- **Lighter alternative (recommended, not required for v1):** create a temporary unmanaged solution under the same publisher and add only the edited entities with `AddSolutionComponentRequest { ComponentType = 1, DoNotIncludeSubcomponents = true }`, plus type 50 when needed. Export it, splice, import, publish, then delete the temporary solution. This makes the import small and avoids re-importing unrelated components. It is the automated version of the community's "slim solution" advice. It adds a write to the org (a solution record), so the developer should only do it if the brief owner accepts that. Record it as a later option.
- **Ribbon ids** do not have to start with the publisher prefix. The platform does not enforce it. Prefix checks are a warning, not an error. Id uniqueness *is* enforced: duplicate ids within the merged ribbon cause import or runtime failures, so treat it as an error.

#### Failure modes

- **Concurrent solution operations:** export, import, publish, and uninstall block each other org-wide. Errors such as "Cannot start the requested operation [Import] because there is another [Import/Publish/Export] running" are expected on busy orgs. Map them to a retryable "org is busy" error, not a generic failure.
- **Import failure:** the import is transactional for the solution as a whole, so a failed import rolls back and leaves the previous diff in place. Errors arrive in `asyncoperation.message` or `friendlymessage` and in `importjob.data`. Show both.
- **Success with warnings:** surface per-component warnings from `importjob.data`.
- **Import succeeded but publish failed (partial success).** The diff is imported but unpublished, so users still see the old command bar. The job must report this as a distinct state, and offer "Publish again" without re-importing.
- **Missing rule references:** validation must resolve `EnableRule` and `DisplayRule` ids against the diff **and** the merged entity and application ribbons, because commands may reference `Mscrm.*` rules defined there. Checking only the diff, as the plugin's message suggests, produces false errors on every overridden out-of-box command.
- **JavaScript function actions** reference `Library="$webresource:<name>"`. A missing web resource is not caught by import validation in a way that is useful to a user. Warn when the web resource does not exist in the org. One `RetrieveMultiple` on `webresource` by name is enough.
- **Schema validation:** the import validates RibbonDiffXml against the ribbon XSDs and fails the whole import on any violation. Validate against Microsoft's XSDs in the sidecar before import, so failures show up before a slow export and import cycle. Use the XSD as the source of truth for the rule list. "OptionSet rule" in `### What it does` is not a rule name I can confirm in the schema, while `CommandClientTypeRule`, `SelectionCountRule`, `FormStateRule`, `ValueRule`, `CustomRule`, `RecordPrivilegeRule`, `EntityPrivilegeRule`, and `OrRule` are.
- **Timeouts:** keep the 15-minute job timeout, but on timeout report "still running in Dataverse; check later". Do not report a failure: the server-side import continues, and the user should not start a second import on top of it.

#### Plugin claims that are wrong

- **Plugin used `PublishAllXml` after import.** It works, but it is wrong for this product. It publishes unrelated pending customizations and is slow. Replace it with a scoped `PublishXml`.
- **Researcher's mapping sets `PublishWorkflows = false`.** That is wrong for a full re-import. It can leave processes in the solution deactivated. Use `true`, or exclude processes from what is imported.
- **"Could not find display rule" on the diff alone.** As a validation model it is wrong (or incomplete, if the plugin also checked the base ribbon). References may resolve to the platform or application ribbon.
- **Treating `RetrieveEntityRibbon` output as a base to apply the diff onto.** It already includes the diff. The plugin may handle this internally. The brief's model wording implies double application.
- **A missing diff defaults to `<RibbonDiffXml/>` and is written back.** That is unsafe when the entity was exported without metadata. Block the entity instead of writing.
- **The hard-coded entity list** is not a platform contract. Use `RibbonNotSupported` and the message fault.

#### Plugin claims that remain unverified

- Whether `HideCustomAction` targets are absent from the `RetrieveEntityRibbon` output (expected, but verify).
- Whether `<ribbons><ribbon/></ribbons>` in `PublishXml` publishes the application ribbon diff on current Online.
- Whether an entity added without metadata exports a usable `RibbonDiffXml`.
- Whether a root `RibbonDiffXml` imports when the solution lacks the Application Ribbons component.
- Export and re-import behavior for solution patches.
- The plugin's actual import flags, poll interval, and `LocLabels`/`Templates` merge. None of these matter, because the values above come from the message contracts, not from the plugin.
- How the plugin's "CustomiseCommand" copies rules. The platform rule (same-Id override) is stated above, and the implementation should follow that rule rather than the plugin.
- The current Online solution file size cap.

### UX

Written from `### What it does` only. No MVP cut is written in the brief, so this section covers the whole capability list. The developer may ship it in the two phases from `### Recommended implementation`. Phase 1 is everything read-only below. Phase 2 adds the editors, "Customise command", validation and publish.

#### Opening the tool

- Activity-bar entry, after the existing tools in registry order.
  - id: `ribbon-workbench`
  - title: `Command Bar Editor`
  - tooltip: `Edit classic command bar buttons, commands and rules in a solution`
  - `allowMultipleInstances: true`. Each tab has its own solution, selection, unsaved edits and publish job, and follows the selected environment. Two tabs may open the same solution. Nothing locks it. Publishing re-reads the solution first, and the last publish wins for the tables it touches.
- Tool icon: a new single-color SVG drawn through `ToolIcon`, for example a toolbar strip with a button. Do not reuse the plugin's icon.
- No title-bar menu item. Everything starts from the tool tab. `File`, `Edit`, `View` and `Help` stay unchanged.

#### Public listing

- Title: `Command Bar Editor`
- Description: "Edit the classic command bar of the tables in an unmanaged solution: add or hide buttons, change commands and their enable and display rules, then publish."

#### Layout

From top to bottom, the tab has a `Toolbar`, an optional banner row, and a three-pane horizontal split.

**Toolbar** (`Toolbar`):
- Start:
  - `Select` labeled `Solution`, listing unmanaged solutions by friendly name, with the unique name shown in the option text.
  - `Button` `secondary` `Load`, which becomes `Reload` once the solution is loaded.
- End:
  - A `Badge` `warn` reading `3 unsaved changes`. It shows only when there are edits.
  - `Button` `secondary` `Validate`.
  - `Button` `ghost` `Discard changes`, which asks for confirmation in a `Modal`.
  - `Button` `primary` `Publish`. It is disabled when nothing has changed or while a publish runs.

**Banner row:** `Alert` messages about the loaded solution. Examples are the non-ribbon component warning, an import failure, and a validation summary. Each banner can be dismissed except the one for a running publish.

**Split.** `Group` with `orientation="horizontal"` and two `Separator`s. Each separator is `w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent`.

1. **Tables pane** (`Panel`, default `240px`, `minSize` `180px`):
   - `SearchInput` that filters by display name or logical name.
   - A list whose first row is always `Application ribbon`, followed by the solution's tables sorted by display name. Each row shows the display name and the logical name in `font-mono text-fg-muted text-xs`.
   - A table that has edits in this tab shows a small `Badge` `accent` `Edited`. A table without ribbon support is muted and shows `Badge` `neutral` `No command bar`.
   - The selected row uses `bg-accent-soft text-fg-strong`, and other rows use `hover:bg-hover`.
   - Separator label: `Resize tables pane`.
2. **Workspace pane** (`Panel`, `minSize` `30%`):
   - `Tabs` with `Command bar`, `Commands`, `Enable rules`, `Display rules`, `Labels`, and `Problems (n)`. The `Problems` tab is present only after validation has run.
   - Separator label: `Resize details pane`.
3. **Details pane** (`Panel`, default `380px`, `minSize` `280px`):
   - The editor for the item selected in the workspace.
   - With nothing selected, it shows `EmptyState` with the text "Select a button, command, rule or label to see its details."

#### Workspace tabs

**Command bar.** This is the visual view of the selected table's merged command bar: the base ribbon plus the solution's changes.

- A `Select` labeled `Location` sits above the tree.
  - For a table, the options are `Form`, `Home grid` and `Subgrid`.
  - For `Application ribbon`, the options are its global locations.
- The command bar is shown as an indented tree, not a pixel copy of the ribbon:
  - Order: tab, then group, then control. Inside a flyout or split button, the order is menu section, then button.
  - Expand and collapse use `ChevronRight` and `ChevronDown` icons.
  - Each node shows a lucide icon for its control type, the label (or the id when there is no label), the id in `font-mono text-2xs text-fg-muted`, and badges.
- Node badges:
  - `Custom` (`accent`): added by this solution.
  - `Hidden` (`neutral`): hidden by this solution. The label also uses `text-fg-muted line-through`.
  - `Command customised` (`accent`): the command was copied into the solution.
- Clicking a node selects it and opens it in the Details pane.
- Each node has a `ghost` icon `Button` (`MoreHorizontal`, `aria-label="Actions for <label>"`) that opens a `Menu`. Only actions valid for that node appear:
  - `Add button`, `Add flyout`, `Add split button` (inside a group or menu section)
  - `Add menu section` (inside a flyout or split button)
  - `Add group` (inside a tab)
  - `Hide` and `Show again` (base items)
  - `Customise command` (base controls whose command is not yet in the solution)
  - `Delete` (custom items only)
- A new item is inserted after the node it was added from. It gets an id with the publisher prefix and is selected so it can be edited right away.
- Order changes through the `Sequence` field in Details. Drag and drop is not offered.

**Commands, Enable rules, Display rules.** Each tab holds a `Toolbar` with a `SearchInput` and a `secondary` `New command` or `New rule` button, followed by a `DataTable`.

- Commands columns: `Id`, `Actions`, `Enable Rules`, `Display Rules`, `Source`.
- Rules columns: `Id`, `Steps`, `Used By`, `Source`.
- `Source` is a `Badge`: `Custom` (`accent`), `Customised` (`accent`) or `Base` (`neutral`).
- A `Checkbox` `Show base items` in the tab toolbar starts unchecked, so the table first lists only what the solution defines.
- Clicking a column header sorts the table: the first click sorts ascending, the second descending, and the active header shows ↑ or ↓.
- Clicking a row opens it in Details. Base items open read-only, with an `Alert` `info` and the `Customise command` action where it applies.

**Labels.** A `DataTable` of the solution's labels with columns `Id`, `Language` (LCID) and `Text`, plus `New label`. Selecting a row edits it in Details.

**Problems.** A `DataTable` of validation results with columns `Severity`, `Table`, `Item`, and `Problem`. An example problem is "Display rule new_IsOwner is not defined." Clicking a row selects that table and that item.

#### Details editors

All editors use `Field` with `Input`, `Select`, `Textarea` and `Checkbox`. Ids, function names and web resource names are shown in `font-mono`. Edits apply to the tab's model on change, and there is no per-editor Save button. Undo is not offered. `Discard changes` is the way back.

- **Button, flyout, split button, menu section, group.**
  - Fields: `Id`, `Label`, `Tooltip`, `Command` (a `Select` of base and solution commands, with a `ghost` `Open` link to the command), `Sequence`, `Image 16`, `Image 32`, and `Modern image`.
  - A group adds `Template` (a `Select` of templates available in the base ribbon and the solution) and `Layout`.
  - `Label` and `Tooltip` accept plain text or a label reference. A `Select` next to the field switches between `Text` and `Label`.
  - Base items are read-only except for `Hide` and `Show again`.
  - Custom items have a `danger` `Delete` button at the bottom.
- **Command.**
  - `Id`.
  - `Actions`: an ordered list. Each action has a type `Select` (`JavaScript function` or `URL`).
    - JavaScript function: `Library` and `Function name`, then `Parameters`.
    - URL: `Address` and a `Pass parameters` `Checkbox`.
    - `Parameters`: rows with `Type` (`String`, `Int`, `Bool`, `Decimal`, `Crm`) and `Value`. For `Crm`, `Value` becomes a `Select` of the schema values, such as `PrimaryControl` and `SelectedControlSelectedItemIds`.
    - Rows reorder with `ArrowUp` and `ArrowDown` `ghost` icon buttons and are removed with `X`. Each icon button has an `aria-label`.
  - `Enable rules` and `Display rules`: lists of referenced rule ids.
    - Add a reference with a `Select` of the available rules.
    - Remove one with `X`. Click an id to open that rule.
    - A reference to a missing rule shows the id in `text-danger` with the hint "Not defined".
- **Enable rule or display rule.**
  - `Id`, then the list of steps.
  - Each step has a `Type` `Select` listing every rule type in the Ribbon schema. The fields below it come from that type's attributes: text attributes use `Input`, enumerations use `Select`, and booleans use `Checkbox`. Required attributes are marked.
  - An `Or group` step contains nested sets of steps. The nested sets are separated by an `OR` label in `text-alt` on `bg-alt-soft`, with a `border-line` left guide line.
  - The rule is either applied as written or inverted, through an `Invert result` `Checkbox` where the schema allows it.
  - `Used by` lists the commands that reference this rule as links.
  - `Delete` is disabled while the rule is in use, with the hint "Used by 2 commands".
- **Label.** `Id`, then one row per language with `Language` (LCID) and `Text`, plus `Add language`.

#### Flow

1. The tab opens. The solution list loads and the rest of the tab shows its empty state.
2. Pick a solution and choose `Load`. The tables pane fills. `Application ribbon` is selected and the `Command bar` tab is shown.
3. Select a table. Its base command bar loads into the `Command bar` tab.
4. Edit through the node menus and the Details pane. Each edit marks the table `Edited` and updates the unsaved-change count.
5. `Validate` checks the edits. It fills `Problems`, switches to that tab when there are errors, and shows an `Alert` with the result, such as "No problems found." or "2 problems found."
6. `Publish` always validates first. If errors are found, publish stops and the `Problems` tab opens. Otherwise a `Modal` asks for confirmation:
   - Title: `Publish command bar changes`
   - Body: "Publishing re-imports the solution <friendly name> and publishes the changed tables. This can take several minutes, and the solution's other components are imported again too."
   - When the solution has components other than tables and ribbons, an `Alert` `warn` says so and recommends a solution that contains only the tables to edit.
   - Buttons: `Cancel`, then `primary` `Publish`.
7. While publishing:
   - The banner row shows a `ProgressBar` with the phase and the percentage.
   - Editing and solution switching are disabled. The tree and lists stay readable.
   - `useToolStatus` publishes the same text, for example `Publishing new_RibbonEdits: importing 40%`.
8. On success:
   - `useToast` shows a success message: "Published new_RibbonEdits."
   - The tab reloads the solution and clears the unsaved changes.
9. On failure:
   - An `Alert` `danger` shows "The solution could not be imported." followed by the reasons returned.
   - The edits stay, so the user can fix them and publish again.

**Switching solution or reloading with unsaved changes** opens a `Modal` with the text "Discard 3 unsaved changes?" and the buttons `Cancel` and `danger` `Discard`.

**When the selected environment changes,** the tab resets to step 1. If there were unsaved changes, `useToast` shows an info message: "Unsaved command bar changes were discarded because the environment changed."

#### States

- **No connection:** `EmptyState` "Connect to an environment to edit command bars."
- **Loading solutions:** the `Solution` `Select` is disabled, with a `Spinner` beside it.
- **No unmanaged solutions:** `EmptyState` "No unmanaged solutions in this environment. Create one that contains the tables whose command bars you want to edit."
- **No solution loaded:** `EmptyState` "Choose an unmanaged solution, then Load, to see its tables and command bars."
- **Loading a solution:** a `Spinner` fills the split area, with the text "Reading solution and command bars…". Loading can take a while for large solutions. `useToolStatus` shows `Loading <unique name>`.
- **Loading a table's command bar:** a `Spinner` in the workspace pane only. Other tables stay usable.
- **Solution has no tables:** `Alert` `danger` "This solution contains no tables. Add the tables whose command bars you want to edit, then reload." The panes are not shown.
- **Table has no command bar:** in the `Command bar` tab, `EmptyState` "This table does not support a command bar."
- **Nothing customised yet:** the Commands, rules and Labels tabs show `EmptyState` "This solution does not define any <commands>. Turn on Show base items to see the built-in ones, or create one."
- **Search with no match:** "No tables match <text>." Each list uses the same pattern.
- **Load or base ribbon error:** `Alert` `danger` with the message returned, plus a `secondary` `Retry` button.
- **Publish success and failure:** as described in the flow.

#### Shared controls

`Alert`, `Badge`, `Button`, `Checkbox`, `DataTable`, `EmptyState`, `Field`, `Input`, `Select`, `Textarea`, `Menu`, `Modal`, `ProgressBar`, `SearchInput`, `Spinner`, `Tabs`, `Toolbar`, `Tooltip`, and `useToast`. The split uses `Group`, `Panel` and `Separator` from `react-resizable-panels`. Icons come from `lucide-react`. The tree is a tool-private component built from these controls. It is not a new shared control.

#### What not to build

- A WinForms or XrmToolBox look:
  - no pixel-faithful classic ribbon canvas;
  - no toolbox palette;
  - no drag and drop from a palette;
  - no copying the plugin's icons, templates, CSS or wording.
- Raw RibbonDiffXml editing or a raw XML view. Edits go through the forms only.
- Adding new tabs. The menu does not offer `Add tab`, because classic ribbon tabs do not appear in the Unified Interface command bar. A tab that the solution already adds still shows and can be edited.
- Authoring new group templates. Groups pick from existing templates only.
- Modern commands (the maker portal command designer).
- Editing a managed solution, or editing tables outside the loaded solution.
- Undo and redo history, copying items between tables, and importing or exporting diff files.
- Installing anything into the environment, and self-update.
- A title-bar menu entry.

### Implementation notes and test evidence

#### Files and endpoints added

- **Sidecar** `api/PowerTools/PowerTools.API/Tools/RibbonWorkbench/`, registered in `Program.cs` with `app.MapRibbonWorkbenchEndpoints()`. The group uses `DataverseContextFilter`, and every Dataverse call goes through `DataverseClientFactory`.
  - `GET /api/ribbon-workbench/solutions`: unmanaged, visible, non-patch solutions joined to the publisher prefix. `Default` and `Active` are left out by unique name.
  - `POST /api/ribbon-workbench/load`: exports the solution, reads `customizations.xml` and `solution.xml`, and returns each table's diff, a diff hash, `ribbonNotSupported`, a read-only reason, the application ribbon, root components other than tables and ribbons, a privilege check, and the rule-type list the editor builds its forms from.
  - `GET /api/ribbon-workbench/base-ribbon?entity=`: `RetrieveEntityRibbon` (filter All) or `RetrieveApplicationRibbon`. It unzips `RibbonXml.xml` and returns tabs (contextual tabs included), commands, enable and display rules, and group templates with their layouts.
  - `POST /api/ribbon-workbench/validate`: checks the changed diffs (see below).
  - `POST /api/ribbon-workbench/publish`: validates again, then queues a job. If there are errors it returns `422 validation_failed` with the problems.
  - `GET /api/ribbon-workbench/jobs/{jobId}`: job status, phase, progress, errors, warnings, and publish targets.
  - `POST /api/ribbon-workbench/publish-again`: a scoped `PublishXml` only, for the "imported but not published" state.
  - Files: `RibbonWorkbenchDtos.cs`, `RibbonXml.cs` (XML to a generic node and back, keeping elements the editor does not know), `RibbonSolutionPackage.cs` (read and splice), `RibbonDefinition.cs`, `RibbonRuleTypes.cs`, `RibbonDiffValidator.cs`, `ImportJobData.cs`, `RibbonWorkbenchClient.cs`, `RibbonWorkbenchService.cs`, `RibbonPublishJob.cs` (job, store, publisher, and runner), `RibbonWorkbenchFaults.cs`, `RibbonWorkbenchEndpoints.cs`.
- **Sidecar tests** in the new project `api/PowerTools/PowerTools.API.RibbonWorkbench.Tests/`, added to `PowerTools.sln`. They use a fake `IRibbonWorkbenchClient` and fixture XML written for the tests.
- **Desktop** `desktop/src/ui/tools/ribbon-workbench/`:
  - `tool.ts`: id `ribbon-workbench`, title `Ribbon Editor`, `allowMultipleInstances: true`.
  - A new icon, `RibbonWorkbench.tsx`, `api/ribbonApi.ts`, `state/useRibbonWorkbench.ts`.
  - `model/`: `node`, `diff`, `commandBar`, `edits`, `rows`, `types`, `apiError`.
  - `components/`: tables pane, command bar tree, item tabs, modals, and the Details editors for controls, commands, rules, and labels.
  - `tests/`: fixtures, node tests for the model, and a renderer test with MSW handlers.
- One registry entry in `desktop/src/ui/tools/registry.tsx` and one catalog entry in `publicCatalog.ts`, between Polymorphic Lookup Creator and Solution Components Mover. That keeps the existing alphabetical-by-id order.
- `desktop/test/toolRegistry.test.ts` updated. The README tool table was regenerated with `node scripts/sync-readme-tools.mjs`. `CHANGELOG.md` has an Unreleased entry.
- Website page `website/src/content/tools/ribbon-workbench.md`.

#### Behavior taken from the brief

- **Title.** "Ribbon Editor", per the user's answer under Open questions. The id stays `ribbon-workbench`.
- **Load.**
  - Online uses `ExportSolutionAsync`, polls the async operation every 3 seconds, then calls `DownloadSolutionExportData`. On-premises connections, and servers that reject the async message, use synchronous `ExportSolution` with `Managed = false`.
  - A table exported without `RibbonDiffXml` is read-only. A non-customizable table is read-only.
  - The application ribbon is read-only unless the solution contains Application Ribbons (type 50).
  - `RibbonNotSupported` tables never call `RetrieveEntityRibbon`.
  - The warning names every root component other than a table or the application ribbon.
  - Missing `prvImportCustomizations` or `prvPublishCustomizations`, checked with `RetrieveUserPrivilegeByPrivilegeName`, opens the tool read-only. If that message is not available, the check is skipped.
- **Merge.** The published ribbon already contains the loaded diff. Before the current diff's custom actions are placed by id, the controls that the loaded diff and the current diff add are removed from the published ribbon. Hide actions whose target is missing from the published ribbon are listed under the tree as "Hidden by this solution", with Show again.
- **Edits.**
  - New ids use the publisher prefix and are unique against the diff and the published ribbon.
  - A new group gets a `MaxSize` scaling entry, which is what the Layout field edits.
  - "Customise command" copies only the `CommandDefinition`, under the same id. Rules are not copied.
  - Renaming a command, rule, or label updates the references to it in the same diff.
  - No raw XML view. No Add tab. No new templates.
- **Validation.**
  - Rule, command, and label references resolve against the diff, the table's published ribbon, the application ribbon, and the application diff.
  - Duplicate ids are errors.
  - A missing publisher prefix is a warning. Ids starting with `Mscrm.` or found in the published ribbon are not checked.
  - Required rule attributes are checked, and so is the rule kind (enable or display).
  - A missing `$webresource:` library is a warning, from one `webresource` query.
- **Publish.**
  - The job re-exports the solution, compares each touched diff's normalized hash with the hash from load, and stops with a conflict if they differ.
  - It splices with a case-insensitive table match, then sends `ExecuteAsync(ImportSolution)` with a client `ImportJobId`, `OverwriteUnmanagedCustomizations = true`, and `PublishWorkflows = true`.
  - It polls `asyncoperation` and `importjob` every 3 seconds. A missing `importjob` row counts as queued.
  - It reads `importjob.data` as XML for failures and warnings.
  - It then publishes with a scoped `PublishXml` that lists the touched `<entities>`, plus `<ribbons><ribbon/></ribbons>` for the application ribbon. It never calls `PublishAllXml`.
  - After 15 minutes the job reports "still running", not failed.
  - "Imported but not published" is a separate state, with Publish again.
  - The customization lock is reported as "org is busy".
  - Jobs run one at a time. No `CallerId` is set.
- **UX.**
  - Layout: toolbar, banners, and the three-pane split with the sizes from the brief.
  - Workspace tabs: Command bar, Commands, Enable rules, Display rules, Labels, and Problems, which appears only after validation.
  - Show base items, sortable headers, and the Details editors.
  - Discard, switch, and reload confirmations. Publish confirmation with the components warning.
  - Progress in the banner and in `useToolStatus`. A success toast, then a reload.
  - On an environment change, the tab resets and a toast says the changes were discarded.
- **Deviations to review.**
  - The menu icon is lucide `Ellipsis`, the current name of `MoreHorizontal`.
  - The Details pane shows Tooltip (mapped to `ToolTipTitle`) and the image fields only for button-like controls. Command is shown for controls and groups only. The ribbon schema has no such attributes on menu sections, and none of them except Command on groups, so writing them would fail the import.
  - Commands have a Delete button that is disabled while a control in the solution uses the command. Without it, the only way to undo "Customise command" or "New command" would be Discard changes.
  - Validate with no changes shows "There are no changes to check." The Problems tab does not open.

#### Commands run

| Command | Result |
| --- | --- |
| `dotnet test PowerTools.API.RibbonWorkbench.Tests` | 48 passed |
| `dotnet test PowerTools.sln` | All 9 test projects passed (335 tests). `PowerTools.API.Tests` is a console project with no tests. |
| `npm test` (desktop) | 100 files, 634 tests passed. Includes 18 model tests and 16 renderer tests for this tool. |
| `npm run lint` (desktop) | No problems |
| `npm run build` (desktop) | Succeeded. Vite printed its existing chunk-size warning. |
| `npm run check` (desktop) | Passed: typecheck, lint with `--max-warnings 0`, tests, renderer build, and the Playwright smoke test |
| `corepack pnpm install --frozen-lockfile` and `corepack pnpm build` (website) | Succeeded. `/tools/ribbon-workbench/index.html` built. `pnpm` is not on PATH here, so it ran through corepack (pnpm 11.9.0). |

#### Not run or not verified

- **No live-environment test.** Nothing ran against a Dataverse organization, because there are no credentials, by design. The items the Dataverse review marks "verify" are still unverified:
  - whether `<ribbons><ribbon/></ribbons>` publishes the application diff;
  - whether hide-action targets are absent from `RetrieveEntityRibbon` output;
  - how solution patches behave (they are excluded);
  - the current Online size cap.
- **No validation against the ribbon XSD.** Microsoft's RibbonCore and RibbonTypes XSDs are not in the repository, so the sidecar checks structure and the rule-type table in `RibbonRuleTypes.cs`. That table was written from Microsoft's published ribbon schema documentation and has not been checked against the XSD files. The import still validates against the schema, and its errors are shown. Rule types the table does not know are kept unchanged, and validation warns about them.
- The temporary-solution alternative from the Dataverse review was not built. The review records it as a later option that needs the brief owner's approval.

### Open questions

- **Tool name.** You asked for "Ribbon Workbench", and the researcher recommends "Command Bar Editor" to avoid the plugin's product name. The UX section uses `Command Bar Editor` for the sidebar title, tab title and public listing, and keeps the id `ribbon-workbench`. Confirm the title, or name another one.

  - **Answer (user, 2026-10-19):** Use "Ribbon Editor" as the sidebar title, tab title and public listing name. Keep the id `ribbon-workbench`. This replaces "Command Bar Editor" wherever earlier sections use it.
