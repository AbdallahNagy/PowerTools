### Match

- **Primary plugin:** Early Bound Generator V2 by Daryl LaBar.
  - NuGet id: `DLaB.Xrm.EarlyBoundGeneratorV2`. Catalog URL: `https://www.xrmtoolbox.com/plugins/DLaB.Xrm.EarlyBoundGeneratorV2/`.
  - Latest version 2.2026.9.20, published 2026-09-21.
  - NuGet description: "Generates Early Bound Entities/Option Sets/Messages. Uses the DataverseModelBuilder from the SDK, and shows command line used to create the classes."
  - Tags: PAC, ModelBuilder, Dataverse, Xrm, EarlyBound, Generator, XrmToolBox, Plugins.
  - The XrmToolBox site could not be reached from this session (the proxy refused the connection). Name, author, version, tags and license were read from NuGet records with the same package id. Download counts and the catalog's "open source" flag were not checked.
- **Source:** https://github.com/daryllabar/DLaB.Xrm.XrmToolBoxTools, read at commit `6f40528` (2026-09-21).
  - Backend: `DLaB.EarlyBoundGeneratorV2.Logic/` and `DLaB.ModelBuilderExtensions/`.
  - WinForms host: `DLaB.EarlyBoundGeneratorV2/`.
  - There is also a headless NuGet package, `DLaB.Xrm.EarlyBoundGeneratorV2.Api` 2.2026.9.20. It targets net48 and net10.0 only.
- **License:** MIT (`LICENSE`, "Copyright (c) 2015 Daryl LaBar"). No copyleft.
- **The engine underneath (important):** the plugin runs Microsoft's generator in-process through the NuGet package `Microsoft.PowerPlatform.Dataverse.ModelBuilderLib` 2.0.16.
  - This is the same library behind `pac modelbuilder build`.
  - Package license: Microsoft Dynamics 365 SDK license terms (`LicenseTerms.docx` in the package). Distributing the `.dll` files inside an app is allowed under the "Distributable Code" clause. The conditions are: add significant primary functionality, pass on terms that protect Microsoft, indemnify Microsoft, and do not use Microsoft trademarks. The same clause already covers the Dataverse.Client DLLs the sidecar ships.
  - Its source is MIT at https://github.com/microsoft/PowerPlatform-DataverseModelBuilder. That repo's last commit is 2024-05-08, so it may lag the 2.0.16 package.
- **V1 versus V2:**
  - `DLaB.Xrm.EarlyBoundGenerator` (V1) is legacy. It wraps CrmSvcUtil.exe (.NET Framework only) and its last release is 1.2023.12.6 (2023-12-07).
  - V2 is current, released monthly, and is the right model to follow.
  - V1 was reviewed for context only. None of its logic is recommended.
- **Related references:**
  - `pac modelbuilder build` in the Power Platform CLI (`Microsoft.PowerApps.CLI.Tool` 2.13.1, 2026-10-07). Same engine, run as a separate CLI with its own sign-in.
  - Microsoft's ModelBuilder source, cited for the metadata queries below.
- **Confidence: high.** The plugin is unambiguous, both the plugin and its engine are open source and read directly, and the license is permissive.
- **Existing Power Tools coverage on main: none.**
  - `registry.tsx` has no code-generation tool.
  - Attribute Explorer browses metadata but does not generate code.
  - Searching main for `early bound`, `earlybound` and `modelbuilder` found only the agent definition files, two Data8 third-party sidecar files, and a plugin-registration research note.
  - This should be a new activity-bar tool.

### What it does

- Connects to one environment and generates C# early-bound classes from its live metadata:
  - one class per table (entity)
  - choice (option set) enums: global, and local per table
  - request/response classes for custom APIs, actions and other SDK messages
  - a LINQ `OrganizationServiceContext` subclass, the "service context"
- Lets the user limit which tables and messages are generated, by explicit names or wildcards (`*`, `%`).
- Lets the user set the namespace, the service context name and the output folders (Entities, OptionSets, Messages). It can write one file per object.
- Optional output features:
  - attribute-name and relationship-name constants
  - choice values as enums instead of `OptionSetValue`
  - turning off `INotifyPropertyChanged`
  - virtual attributes
  - entity type codes
  - turning off the `GeneratedCode` attribute
- Shows the matching `pac modelbuilder build ...` command, so the same output can be reproduced in CI.
- Keeps its settings in a `builderSettings.json` next to the generated code, so runs can be repeated and checked into source control.
- DLaB-only extras on top of Microsoft's output (about 70 settings). Examples:
  - camel-casing names using a word dictionary
  - an attribute blacklist
  - rename overrides
  - marking deprecated fields `[Obsolete]`
  - option-set metadata attributes
  - making read-only fields editable
  - transliterating non-Latin choice labels
  - deleting stale `.cs` files
  - adding new files to a `.csproj`
  - saving metadata to a file for offline generation

### Backend findings

**Overall flow**

- `Logic.Create(IOrganizationService)` (`DLaB.EarlyBoundGeneratorV2.Logic/Logic.cs:37-90`) runs five steps:
  1. Builds arguments from a settings file (`ArgumentBuilder.GetArguments`, `DLaB.ModelBuilderExtensions/ArgumentBuilder.cs:51-95`).
  2. Creates `new ModelBuilder(logger)`.
  3. Calls `runner.Parameters.LoadArguments(args)`.
  4. Calls `runner.Invoke(service)`.
  5. Treats any result other than `0` as failure.
- So all Dataverse reads happen inside Microsoft's ModelBuilderLib. DLaB swaps in its own services by assembly-qualified type name: `MetadataProviderService`, `MetadataQueryProviderService`, `CodeWriterFilterService`, `CodeGenerationService`, `NamingService` and `CustomizeCodeDomService` (defaults at `Settings/EarlyBoundGeneratorConfig.cs:450-490`).
- `ArgumentBuilder` builds the `PAC modelbuilder build ...` string shown to the user (`ArgumentBuilder.cs:91-92`). It always forces `SplitFilesByObject = true` and sets `OutDirectory`.

**Dataverse operations performed by the engine**

All metadata reads are in Microsoft's `Services/MetadataProviderQueryService.cs`.

- **Tables, no filter:** `OrganizationRequest("RetrieveAllEntities")` with `EntityFilters = Entity | Attributes | Relationships` and `RetrieveAsIfPublished = false` (lines 39-44).
  - This is the heaviest call: every table with every column and relationship.
  - On a large org it takes minutes and returns tens of MB.
- **Tables, with `entitynamesfilter` (`;`-separated):** `RetrieveMetadataChangesRequest` with an `EntityQueryExpression`, `MetadataFilterExpression(Or)` of `logicalname Equals` conditions, and `AllProperties = true` (lines 47-71).
  - Names are batched 20 per request (`MaxConditions = 20`, line 16) to stay under the "hard limit of conditions in a single filter".
  - Gotcha: the guard is `entityLogicalNames.Count() >= 0` (line 33), which is always true.
- **Wildcard table filters (DLaB):** `DLaB.ModelBuilderExtensions/MetadataQueryProviderService.cs:28-78`.
  - Runs `RetrieveMultiple` on the `entity` table: `QueryExpression("entity")`, `ColumnSet("logicalname")`, condition `logicalname Like 'prefix%'`, one query per wildcard.
  - Merges the results with the explicit names, sorts and de-duplicates them.
  - Then calls `RetrieveMetadataChangesRequest` with `logicalname In` in batches of 50 (line 42).
- **Option sets:** `OrganizationRequest("RetrieveAllOptionSets")` with `RetrieveAsIfPublished = true`. It runs only when `generateGlobalOptionSets` or `legacyMode` is set; otherwise none are returned (Microsoft lines 79-89).
- **SDK messages:** paged `ExecuteFetchRequest`, with the paging cookie re-injected each page (`while (pagingInfo.HasMoreRecords)`, lines 91-175).
  - Base query (`MetadataReader/FetchQuery.xml`): `sdkmessage` joined to `sdkmessagepair` (`endpoint = '2011/Organization.svc'`), then outer joins to `sdkmessagerequest`, `sdkmessagerequestfield`, `sdkmessageresponse` and `sdkmessageresponsefield`, plus an inner join to `sdkmessagefilter` (`isvisible = 1`).
  - A second paged query maps messages to tables.
  - `messagenamesfilter` narrows both queries.
  - `ExecuteFetch` is a deprecated message (flag for Dataverse review).
- **DLaB post-filter on messages** (`MetadataQueryProviderService.cs:84-117`): removes the `CreateMultiple`, `UpdateMultiple`, `DeleteMultiple` and `UpsertMultiple` messages that Microsoft adds by default, unless the message filter asks for them.
  - Bug: the wildcard check always tests the literal `"UpsertMultiple"` (line 115). Do not copy this.
- No create, update, delete, publish or `ExecuteMultiple` calls anywhere. The tool is **read-only against Dataverse** and **writes only to the local disk**.

**Metadata changes DLaB makes in memory** (`MetadataProviderService.cs:91-150`)

- Forces `IsValidForCreate = true` on `createdonbehalfby`, `modifiedonbehalfby` and `overriddencreatedon`.
- Optionally does the same for `createdby`, `createdon`, `modifiedby`, `modifiedon` and the owning* fields, or for all fields. It does this through reflection on `AttributeMetadata`.
- Renames the schema names of `statecode` and `statuscode` to `StateCode` and `StatusCode`.
- Optionally saves the loaded metadata to XML with `DataContractSerializer`, and can generate from that file later with no live connection (`IsLiveConnectionRequired => !ReadSerializedMetadata`).

**Filtering rules worth keeping** (`DLaB.ModelBuilderExtensions/CodeWriterFilterService.cs:52-92`)

- Table approval goes through a blacklist plus regex blacklist (`BlacklistLogic`).
- Attribute approval uses `entity.attribute` blacklist entries.
- The hidden `*_name` string companion columns of file columns are kept (`IsFileDataTypeAttribute`, lines 95-102).
- Relationships are generated only when `GenerateEntityRelationships` is on.
- `connection_record1objecttypecode` and `connection_record2objecttypecode` are dropped unless `EmitEntityETC` is on.

**Validation and failure modes**

- Input checks before a run (`DLaB.EarlyBoundGeneratorV2/EarlyBoundGeneratorPlugin.cs`):
  - the namespace must differ from the service context name (`:260`)
  - each output path must be a folder when one-file-per-object is on, and a file otherwise (`:180-215`)
  - each attribute blacklist line allows at most one `.`; allowed characters are letters, digits, `_`, `*` and `.`; the table part cannot contain `*` or start with a digit or `_` (`:217-258`)
  - a settings file written by a newer major version blocks the run (`:279`)
- `ModelBuilder.Invoke` catches every exception and returns `2`, writing the message to `Console.Error` (Microsoft `ProcessModelInvoker.cs:121-163`). A failure therefore shows up only as a non-zero code plus log text.
  - `Parameters.VerifyArguments()` is called but its result is ignored.
  - `url` is marked Required but is not needed when an `IOrganizationService` is passed in.
- **Process-wide state:** `Logic.Create` calls `Console.SetOut(...)` and resets it afterwards (`Logic.cs:39-43, 86-87`), and the extensions use static caches (`ServiceCache.ClearCache`). Neither is safe for concurrent runs in one process.
  - In the sidecar this matters twice. The Electron host reads the sidecar's stdout for `LISTENING`, and the sidecar serves other requests at the same time.
- **Destructive file options:** `DeleteFilesFromOutputFolders` deletes every `*.cs` file in the Entities, OptionSets and Messages folders before writing (`CodeGenerationService.cs:398-428`). Local option-set cleanup deletes files older than the run start (`:121-126`, `:325-348`).
- Read-only (source-controlled) target files are switched to writable, and the run aborts if that fails (`Logic.cs:95-124`).
- Privileges: read access to entity, attribute, option-set and SDK-message metadata. Any user who can sign in normally has this; no System Administrator role is needed.

**Keep**

- Microsoft's engine (ModelBuilderLib) as the generator, with its `builderSettings.json` format so output matches `pac modelbuilder build`.
- Table and message name filters, including wildcard expansion.
- Metadata fetch in batches of 20 to 50 names.
- A one-at-a-time run model.
- The `pac modelbuilder build ...` command preview.
- The validation rules above.
- Never deleting files unless the user opts in, and then only `*.cs` in the generated subfolders.

**Leave behind**

- The ~70-option DLaB extension surface in v1. Candidates for later, each as a separate item: attribute blacklist, camel-casing dictionary, `[Obsolete]` marking, enum properties, option-set metadata attributes, transliteration.
- Speech notification, the XrmToolBox MessageBus, `.csproj` editing, settings stored per connection, and the WinForms property grid.
- V1/CrmSvcUtil entirely.
- DLaB's `PacModelBuilderCodeGenHack.cs`, which is a copy of Microsoft's `Write` method (`:46`).

**Do not take `DLaB.ModelBuilderExtensions` as a package dependency in v1.** It targets net48 and net10.0, and the sidecar is `net9.0`. It also expects `Console.SetOut` redirection and static caches. Its MIT license would allow reuse, but the target framework blocks it unless the sidecar moves to .NET 10, which is a separate change.

### Power Tools mapping

**Tool**

- id **`early-bound-generator`**
- title **Early Bound Generator**
- tooltip "Generate C# early-bound classes for tables, choices, and messages"
- New activity-bar tool with `allowMultipleInstances: true` (one tab per environment or output folder is fine). It does not extend FetchXML Builder or Data Migration.

**Reuse**

- `GET /api/metadata/entities` for the table picker (`EntityInfo` contract in `desktop/src/ui/shared/contracts/dataverse.ts`). It already excludes intersect and private tables.
- `useTabConnection` and `meta.connectionName`, `useToolStatus` for the status bar.
- Shared UI: `DataTable`, `SearchInput`, `Checkbox`, `Field`, `Input`, `Tabs`, `CodeEditor` for a read-only preview, `ProgressBar`, `Alert`, `EmptyState`, `Toast`.
- The polled-job pattern from Translator and Bulk Workflow Execution: `I<Tool>JobStore` plus a hosted `<Tool>JobRunner` registered in `Program.cs`, `POST` returns a `jobId`, then `GET /jobs/{id}`.

**New sidecar endpoints**

Location: `api/PowerTools/PowerTools.API/Tools/EarlyBoundGenerator/`. Mapped by `MapEarlyBoundGeneratorEndpoints()` in `Program.cs`, group `/api/early-bound-generator`, with `DataverseContextFilter`.

- `GET /messages?search=`
  - Lists custom APIs, custom actions and other non-private SDK messages for the message picker.
  - Behind it: paged `RetrieveMultiple` of `sdkmessage` (`name`, `isprivate = false`) joined to `sdkmessagepair` (`endpoint = '2011/Organization.svc'`). Optionally also `customapi` (`uniquename`, `displayname`).
  - Returns `{ name, isCustomApi, isPrivate }[]`.
- `POST /preview-command`
  - Pure function, no Dataverse call.
  - Body: the `GenerationSettings` described under `POST /jobs`.
  - Returns `{ pacCommand: string, builderSettingsJson: string }` so the UI can show and copy both.
- `POST /jobs`
  - Body `GenerationSettings`:
    - `{ outputDirectory: string; namespace: string; serviceContextName: string; entityTypesFolder: string; optionSetsTypesFolder: string; messagesTypesFolder: string; entityNamesFilter: string[]; messageNamesFilter: string[]; generateMessages: boolean; generateGlobalOptionSets: boolean; emitFieldsClasses: boolean; emitVirtualAttributes: boolean; emitEntityETC: boolean; suppressINotifyPattern: boolean; suppressGeneratedCodeAttribute: boolean; writeSettingsFile: boolean }`
  - Checks before queuing:
    - `outputDirectory` is an absolute, existing folder
    - `namespace` differs from `serviceContextName`
    - folder names are relative, contain no `..`, and are not rooted
    - the table filter is not empty, unless the user explicitly picked "all tables"
  - Returns `{ jobId }`.
  - The runner:
    - creates the client with `DataverseClientFactory` (online `ServiceClient` with `ExternalTokenManagement`, or on-premises `OnPremiseClient`)
    - builds a `ModelBuilderInvokeParameters`, setting properties directly or via `LoadArguments`, with `SplitFilesByObject = true` and `OutDirectory = outputDirectory`
    - calls `new ModelBuilder(logger).Invoke(service)` on a background thread
    - captures log lines through the `ILogger` passed to `ModelBuilder`, not through `Console.SetOut`
    - treats any non-zero result as failure and returns the captured log
    - after success, lists the `*.cs` files written under `outputDirectory` (relative paths, sizes)
    - if `writeSettingsFile` is set, writes `builderSettings.json` into `outputDirectory`
  - Only one generation runs at a time across the whole sidecar. A second `POST` while one is running returns `409` with a clear message.
- `GET /jobs/{jobId}`
  - Returns `{ state: "queued"|"running"|"succeeded"|"failed", stage: "readingMetadata"|"writingCode"|null, log: string[], files: { path, bytes }[], error: string|null, pacCommand: string }`.
- `GET /jobs/{jobId}/file?path=`
  - Returns one generated file's text for the in-app read-only preview.
  - The path must resolve inside `outputDirectory`.
- New xUnit project `api/PowerTools/PowerTools.API.EarlyBoundGenerator.Tests/`, added to `PowerTools.sln`.

**New desktop capability, the only new IPC**

- A folder picker, `desktopBridge.selectDirectory(): Promise<string | null>`.
  - Implemented in `desktop/src/electron/` with `dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] })`.
  - Exposed through the preload bridge and `desktop/src/ui/platform/desktopBridge.ts`.
  - This is a file-dialog capability the platform adapter does not have today. Nothing on main uses `showOpenDialog`.
- Optionally `desktopBridge.openPath(path)` (`shell.openPath`) for "Open folder" after a run. Skip it if `openExternalUrl` already covers that.

**Desktop folder layout:** `desktop/src/ui/tools/early-bound-generator/`

- `tool.ts`
- `EarlyBoundGenerator.tsx`
- `api/`
  - `earlyBoundGeneratorApi.ts` (`apiGet`/`apiPost` with `meta.connectionName`)
  - `queryKeys.ts`
- `model/`
  - `settings.ts`: defaults, validation and wildcard parsing, pure and unit-tested
  - `types.ts`
  - `apiError.ts`
- `components/`
  - table picker
  - message picker
  - options form
  - output folder field
  - command preview
  - run log and file list
- `tests/node`, `tests/renderer`, `tests/fixtures.ts`

Add an entry to `publicCatalog.ts` using the description from `### UX`, plus an icon SVG.

### Recommended implementation

1. **Dependency spike (sidecar only, blocking).**
   - Add `Microsoft.PowerPlatform.Dataverse.ModelBuilderLib` 2.0.16 to `PowerTools.API.csproj`.
   - Check that it builds and runs next to `Microsoft.PowerPlatform.Dataverse.Client` 1.2.10. Both packages ship their own `Microsoft.Xrm.Sdk.dll`, so watch for assembly conflict warnings, a runtime `MissingMethodException`, and type identity problems when a `ServiceClient` is passed as `IOrganizationService`.
   - Check that the single-file self-contained publish (`PublishingForSidecar=true`) still loads it.
   - If the conflict cannot be resolved, stop and report before building UI.
2. **Contracts and API.** Add `EarlyBoundGeneratorDtos.cs`, then:
   - `EarlyBoundGeneratorSettingsBuilder.cs`: settings to `ModelBuilderInvokeParameters`, the PAC command line and `builderSettings.json`. Pure and unit-tested.
   - `EarlyBoundGeneratorValidation.cs`
   - `EarlyBoundGeneratorJobStore.cs` and `EarlyBoundGeneratorJobRunner.cs`: one at a time, with a captured `ILogger`
   - `EarlyBoundGeneratorMessages.cs` (the message list)
   - `EarlyBoundGeneratorEndpoints.cs`
   - Register them in `Program.cs`.
3. **Sidecar tests.** Cover:
   - validation: namespace equals context; relative, rooted and `..` folders; empty filter
   - wildcard expansion and name batching (at most 20 per `RetrieveMetadataChanges` request)
   - PAC command output for a known settings set
   - path-traversal rejection on `/file`
   - the `409` on a second concurrent job
   - a fake-generator test for job state changes
   - Use deterministic fakes, never a live org.
4. **Platform.** Add `selectDirectory` to the Electron main process, the preload script and `desktopBridge.ts`, with a typed test fake.
5. **Tool module.**
   - Table picker from `/api/metadata/entities` (multi-select plus wildcard prefixes).
   - Message picker from `/messages`.
   - Options form with defaults matching the plugin: namespace `DataverseModel`, context `DataverseContext`, folders `Entities` / `OptionSets` / `Messages`, generate messages on, suppress `GeneratedCode` attribute on, virtual attributes on, entity type codes off.
   - Live PAC command preview, run button, progress via `useToolStatus` while polling, then file list and read-only code preview.
   - Remember the last output folder per tab only. Persisting settings is out of v1 scope; `builderSettings.json` in the output folder is the durable record.
6. **Registry and catalog.** Add `early-bound-generator/tool.ts` to `BUILT_IN_TOOLS` (alphabetical: after `data-migration`, before `fetchxml-builder`) and the matching `PUBLIC_TOOLS` entry in the same order.
7. **Desktop tests.**
   - Node tests for settings validation, wildcard parsing and command building.
   - A renderer test for picker, run, poll and success/failure display with a mocked API.
   - Then `npm test`, `npm run lint`, `npm run build` (or `npm run check`).

**Risks**

- Assembly conflict between the two `Microsoft.Xrm.Sdk.dll` copies (step 1).
- Unfiltered `RetrieveAllEntities` with attributes and relationships can take minutes and use a lot of memory. Require a table filter by default and warn on "all tables".
- The online access token is captured when the request is made. Very long runs could outlive it. Acceptable for v1; note it.
- `ExecuteFetch` is deprecated. Confirm it still works online and on-premises (Dataverse review).
- The engine writes to `Console.Error`, which is process-wide. Make sure it cannot corrupt the sidecar's stdout handshake.
- Overwriting files in a user's repo. In v1, never delete files; only overwrite the files the engine produces.

**License and what not to copy**

- Do not copy DLaB source, WinForms dialogs, icons or copy text. Credit "Early Bound Generator V2 by Daryl LaBar (MIT), github.com/daryllabar/DLaB.Xrm.XrmToolBoxTools" in the brief and PR.
- Ship ModelBuilderLib only as its NuGet DLL, under the Dynamics 365 SDK distributable-code terms. Do not use Microsoft trademarks to suggest endorsement.
- Do not vendor `PacModelBuilderCodeGenHack.cs` or Microsoft's generator source.
- Do not shell out to `pac`. It needs a separate install and separate sign-in, and the in-process library uses the tab's existing connection.

### Open questions for the user

- **Product scope for v1.** Two real options:
  - **(A, recommended)** A lean generator on Microsoft's ModelBuilderLib: the options Microsoft supports, and output identical to `pac modelbuilder build`.
  - **(B)** DLaB-parity extensions (camel-casing, attribute blacklist, enum properties, `[Obsolete]`, option-set metadata attributes, and more). This needs either the sidecar moved to .NET 10 to use the MIT `DLaB.Xrm.EarlyBoundGeneratorV2.Api` package, or a clean-room rewrite of the chosen extensions.
- **Licensing confirmation.** Confirm the team accepts shipping Microsoft's ModelBuilderLib DLL under the Dynamics 365 SDK license terms. These are the same kind of terms the Dataverse.Client DLL already ships under. They are not copyleft.

### Open questions

- **Product scope for v1 — answered by the user (2026-10-12):** (A) Lean generator on Microsoft's ModelBuilderLib, output identical to `pac modelbuilder build`. DLaB-parity extensions are out of v1 scope.
- **Licensing — answered by the user (2026-10-12):** Accepted. Ship `Microsoft.PowerPlatform.Dataverse.ModelBuilderLib` as its NuGet DLL under the Dynamics 365 SDK distributable-code terms.
- **Branch scope — user instruction:** Build from `main` only. Ignore any Early Bound Generator implementation on other branches or pull requests.

### UX

Scope is `### What it does`, cut to the user's v1 answer (A): only the options Microsoft's ModelBuilder supports, with output identical to `pac modelbuilder build`. The DLaB-only extras are not in v1.

#### Opening the tool

- New activity-bar tool. Id `early-bound-generator`. Title **Early Bound Generator**.
- Sidebar tooltip and `aria-label`: `Generate C# early-bound classes from an environment's metadata`.
- Icon: a new single-color SVG drawn through `ToolIcon`, for example braces around a table grid. Do not reuse the XrmToolBox plugin icon.
- `allowMultipleInstances: true`. Each tab keeps its own output folder, settings, command, and last-run results. Every tab follows the selected environment. Two tabs can point at two different folders, such as two projects or two namespaces.
- No title-bar menu item. The sidebar entry and the command palette are enough.

#### Public listing

- Title: `Early Bound Generator`
- Description: `Generate C# early-bound classes for tables, choices, and messages from an environment's live metadata, and copy the matching pac modelbuilder command for CI.`

#### Layout

The tab has a `Toolbar` on top, and below it a horizontal split.

- **Toolbar**
  - Start: `Output folder` read-only `Input` showing the chosen path (`font-mono`, truncated from the left, full path in `title`), then a secondary `Button` `Choose folder...` that opens the native folder dialog. The native dialog is a platform call, not a new shared control.
  - End: primary `Button` `Generate`. Disabled until a folder is chosen, an environment is connected, and the form is valid. When it is disabled, a `Tooltip` gives the reason, such as `Choose an output folder first.`
- **Split**: `Group` / `Panel` / `Separator` from `react-resizable-panels`, as in `shell/layout/Layout.tsx`.
  - Left panel `Settings`: `defaultSize` 45, `minSize` 30. Scrolls by itself.
  - Separator: `aria-label="Resize panes"`, `w-1 cursor-col-resize bg-raised hover:bg-accent active:bg-accent`.
  - Right panel `Output`: `defaultSize` 55, `minSize` 30.

#### Settings panel (left)

Plain sections with `text-base font-semibold text-fg-strong` headings, top to bottom, on `bg-surface`. Each control sits in a `Field` with a label and hint. No inner `Tabs`.

1. **Code**
   - `Namespace`: `Input`, required. Error `Enter a valid C# namespace, such as Contoso.Model.` when it is empty or invalid.
   - `Service context name`: `Input`, optional. Hint `Leave empty to skip the LINQ service context.`
   - `One file per object`: `Checkbox`.
2. **Folders**: subfolders relative to the output folder.
   - `Tables folder` (default `Entities`)
   - `Choices folder` (default `OptionSets`)
   - `Messages folder` (default `Messages`)

   Each is an `Input`. Reject absolute paths and `..` with an inline `Field` error.
3. **Tables**
   - `Tables to generate`: `Textarea`, `font-mono`, 5 rows. One logical name or pattern per line. Hint `Use * or % as a wildcard. Leave empty to generate every table.`
   - When it is empty, show an `Alert` tone `warn` under it: `Every table in the environment will be generated. This can take several minutes and produce hundreds of files.`
4. **Choices**: `Generate global choices` `Checkbox`. Local choices are always generated with their table.
5. **Messages**
   - `Generate message classes` `Checkbox`. Hint `Request and response classes for custom APIs, actions, and other messages.`
   - `Messages to generate`: `Textarea`, `font-mono`, same rules as Tables. Disabled while the checkbox is cleared.
6. **Options**: one `Checkbox` per option.
   - `Attribute and relationship name constants`
   - `Choice values as enums instead of OptionSetValue`
   - `Turn off INotifyPropertyChanged`
   - `Virtual attributes`
   - `Entity type codes`
   - `Turn off the GeneratedCode attribute`

   If the Dataverse review or the developer finds that Microsoft's ModelBuilder does not support one of these, leave that checkbox out. Do not show it disabled, and do not reimplement it.

Every change updates the command on the right right away. Settings are not saved while you edit. They are written to `builderSettings.json` only when a run succeeds.

#### Output panel (right)

A vertical stack. No inner split.

1. **pac command**
   - Heading `Reproduce in CI`, with a ghost `Button` `Copy` (`Copy` icon, `aria-label="Copy command"`) that confirms with `useToast().success("Command copied.")`.
   - Below it a read-only `CodeEditor`, `h-32`, holding the `pac modelbuilder build ...` command that matches the current settings and folder.
   - Hint in `text-xs text-fg-muted`: `pac uses its own sign-in. Run pac auth create before this command.`
2. **Results**: fills the remaining height (`min-h-0 flex-1`).
   - Before the first run: `EmptyState` `Choose an output folder and select Generate. Generated files are listed here.`
   - After a run: a summary line, for example `42 files written to C:\src\Contoso.Model` with a `Badge` tone `ok` `Done`. Next to it, a ghost `Button` `Open folder` opens the folder in the system file manager.
   - Then a `DataTable` of written files with columns `File` (path relative to the output folder, `font-mono`), `Kind` (`Table`, `Choice`, `Message`, `Service context`, `Settings`), and `Name` (logical name). Sort by clicking a header: first click ascending (↑), second click descending (↓). Default sort is `File` ascending. No row selection and no file preview.
   - A `SearchInput` above the table, `Filter files`, filters by `File` and `Name`.

#### Folder and builderSettings.json

- Choosing a folder that has `builderSettings.json`: load it into the form and show `useToast().info("Loaded settings from builderSettings.json.")`. Values the v1 form has no control for are kept as they are when the file is saved again.
- Choosing a folder without that file: keep the current form values. If the folder already holds other files, the first `Generate` opens a `Modal`, `Generate into this folder?`, with the text `This folder already has files. Generated files with the same names will be replaced. Other files are left alone.` and the buttons `Cancel` (secondary) and `Generate` (primary). Do not ask again in that tab for that folder.
- If `builderSettings.json` cannot be read: show an `Alert` tone `danger` at the top of the Settings panel, `builderSettings.json could not be read: <reason>. The form keeps its current values, and the file is replaced on the next successful run.`
- A successful run writes `builderSettings.json` into the output folder and lists it in Results with Kind `Settings`.

#### States

- **No environment selected**: the Settings panel stays editable, so a user can prepare settings offline. `Generate` is disabled with the tooltip `Connect to an environment first.` The Results area shows `EmptyState` `Connect to an environment to generate code.`
- **Environment changes**: keep settings and folder. Clear Results, and show `EmptyState` `Environment changed. Select Generate to rebuild from <environment name>.`
- **Generating**:
  - `Generate` shows a `Spinner` and the label `Generating...`. Every settings control, `Choose folder...`, and `Generate` are disabled. `Copy` keeps working.
  - The Results area shows an indeterminate `ProgressBar` and `Reading metadata and writing files. Large environments can take several minutes.`
  - Status bar through `useToolStatus`: `Generating early-bound classes...`.
  - There is no Cancel button in v1. Add one only if the backend can stop a run cleanly.
- **Success**:
  - Results as described above.
  - `useToast().success("Generated 42 files.")`.
  - Status bar: `Generated 42 files in 1 min 12 s`.
- **Filter matched nothing**: an `Alert` tone `warn` in Results, `No tables or messages matched the filters. Check the names and wildcards.` No files are written.
- **Error**:
  - An `Alert` tone `danger` at the top of Results with the server message. Insufficient privileges, a folder that cannot be written, and a lost connection get plain wording, for example `You do not have permission to write to this folder.` or `The connection to <environment> was lost. Reconnect and select Generate again.`
  - If the backend reports files that were written before the failure, list them under the alert in the same `DataTable`. Otherwise show no table.
  - `useToast().error("Generation failed.")`. Status bar: `Generation failed`.
  - All settings stay as they were.

#### Shared controls

`Toolbar`, `Button`, `Field`, `Input`, `Textarea`, `Checkbox`, `Alert`, `Badge`, `CodeEditor` (read-only), `DataTable`, `SearchInput`, `EmptyState`, `Modal`, `ProgressBar`, `Spinner`, `Tooltip`, `useToast`, `useToolStatus`, and the `react-resizable-panels` split. Colors come only from theme tokens: `bg-canvas` tool background, `bg-surface` Settings panel, `text-fg-muted` hints, `border-line` dividers. No new token is needed.

#### What not to build

- Any DLaB-only extra: camel-casing and the word dictionary, the attribute blacklist, rename overrides, `[Obsolete]` on deprecated fields, option-set metadata attributes, editable read-only fields, transliteration, deleting stale `.cs` files, adding files to a `.csproj`, and saving metadata for offline generation. One result of this: tables removed from the filter leave their old files behind. Do not add a cleanup option.
- Running `pac` or asking for a second sign-in. The command is for copying only.
- A table or message picker that browses metadata. v1 takes names and patterns as text.
- A preview or editor for generated code, and any edits to generated files.
- Choosing a language other than C#.
- Saving or loading named settings profiles beyond `builderSettings.json` in the output folder.
- The WinForms layout. That means no property grid of every setting, no settings dialog behind a gear button, no log text box as the main output, no XrmToolBox ribbon or host chrome, and none of the plugin's copy or icons.

### Dataverse review

**Evidence used.** The engine source on GitHub: `microsoft/PowerPlatform-DataverseModelBuilder` at `04c1ff4` (2024-05-08). The shipped `Microsoft.PowerPlatform.Dataverse.ModelBuilderLib` 2.0.16 nupkg: its nuspec, release notes and DLL strings. The `Microsoft.PowerPlatform.Dataverse.Client` 1.2.10 nupkg. Microsoft's docs from `MicrosoftDocs/powerapps-docs` on GitHub (`generate-early-bound-classes.md`, `api-limits.md`, `query-schema-definitions.md`, `fetchxml/page-results.md`). The sidecar on main (`DataverseClientFactory.cs`, `ThirdParty/Data8.PowerPlatform.Dataverse.Client/OnPremiseClient.cs`, `Tools/Metadata/MetadataEndpoints.cs`). DLaB at `6f40528`, read only to check one workaround. learn.microsoft.com could not be reached from this session (proxy 403). Claims that need it are marked unverified.

**Messages and metadata: confirmed, with corrections**

- The table reads are as the researcher described. With an empty `entityNamesFilter` the engine sends `RetrieveAllEntities` (`Entity | Attributes | Relationships`, `RetrieveAsIfPublished = false`). With a filter it sends `RetrieveMetadataChangesRequest` with `logicalname Equals` conditions, 20 per request, `AllProperties = true`.
  - Correction to the "always true" gotcha. It matters in one case. A filter that is not empty but parses to no names (for example `";"`) sends zero requests. The run "succeeds" with no tables. It does not fall back to all tables. Never send a filter made only of separators.
  - Unknown or misspelled names come back as nothing, with no error. Logical names are lowercase. A mixed-case name may not match, so normalize to lowercase. Check every name against the `/api/metadata/entities` list before queuing. Report missing names as a validation error. Otherwise the user gets fewer files and no explanation.
  - **Table wildcards are not a `pac modelbuilder` feature.** Microsoft's docs list `*` for `messageNamesFilter` only. The engine sends table names as `Equals`, so `new_*` in `entityNamesFilter` matches no table. Table wildcards are DLaB's extension (its `entity`-table `Like` query). In the chosen scope (A), any prefix picker must expand to explicit logical names from the entity list the sidecar has already loaded. Write only explicit names to `builderSettings.json` and the PAC command. Do not query the `entity` table. Once expanded, the saved settings reproduce in CI only the tables that existed at generation time. Tell the user this.
  - Drop the planned sidecar test "at most 20 names per `RetrieveMetadataChanges` request". The batching happens inside Microsoft's engine, and Power Tools should not reimplement metadata reads. Test name normalization and the unknown-name check instead.
  - `/api/metadata/entities` hides intersect and private tables. `pac` generates intersect tables when they are named or when no filter is set. Add a free-text entry for logical names the picker does not list, validated against a full `RetrieveAllEntities` (`EntityFilters.Entity`) list, not the filtered one.
- **Published versus unpublished.** Tables come from published metadata. `RetrieveMetadataChanges` has no as-if-published option, and the unfiltered path passes `false`. Global choices from `RetrieveAllOptionSets` use `RetrieveAsIfPublished = true`. So unpublished column changes do not appear, but unpublished global choice edits do. Users must publish customizations before they generate.
- **Labels** come from the organization base language: a `RetrieveMultiple` of `organization.languagecode`, `top=1`. They do not come from the user's UI language. Choice enum member names are built from these labels.
- **Messages.** Confirmed: paged `ExecuteFetchRequest`. It uses `distinct='true'`, outer joins to request/response fields, an inner join to `sdkmessagefilter` (`isvisible = 1`) and `sdkmessagepair.endpoint = '2011/Organization.svc'`. A second paged query maps messages to tables.
  - Corrections and additions:
    - **The message filter is injected into FetchXML unescaped** (`value='{itm}'`, with `*` replaced by `%`). A name with `'`, `<` or `&` breaks the query or changes it. The sidecar must allow only `[A-Za-z0-9_]` and `*` in each message filter entry, and reject anything else before calling the engine.
    - `*` becomes `like '%'`. In SQL `LIKE`, `_` is also a single-character wildcard, so `new_*` can also match `newX...`. This is minor and only over-includes.
    - **A non-empty `messageNamesFilter` forces `GenerateSdkMessages = true`.** The engine sets it itself. A "generate messages: off" toggle with a leftover message filter still generates messages. The settings builder must clear `messageNamesFilter` when messages are off.
    - **Messages on with no filter reads and generates every visible SDK message.** That is thousands of rows and files, and the joined result can be very large. Release 2.0.6 notes "SDK message builder would miss messages due to the volume of data". Distinct queries over link-entities may not return a paging cookie. Dataverse then falls back to page-number paging, which is capped at 50,000 rows in total (`page-results.md`). Recommendation: default to messages on only when the message filter is not empty. Otherwise default to off, or warn the way "all tables" warns.
    - With messages off and no message filter, the engine sends no `sdkmessage*` queries at all. This lets a user without read access to SDK message tables still generate tables.
    - The engine skips messages whose request classes already exist in `Microsoft.Xrm.Sdk.Messages` or `Microsoft.Crm.Sdk.Messages`. It checks by reflection against the **loaded** `Microsoft.Xrm.Sdk.dll` / `Microsoft.Crm.Sdk.Proxy.dll`, by prefix (`StartsWith`). The log line is "Wrote N Message(s). Skipped M". A picked message may produce no file. The message picker should show this ("already in the SDK") so the result is not a surprise.
    - Microsoft's docs: when messages are generated, `serviceContextName` must be set. Without the generated `OrganizationServiceContext`, using the message classes fails at runtime with a `DataContractResolver` deserialization error. Add this to validation: if messages are on, the context name is required. An empty context name is otherwise legal and means no context file.
  - `ExecuteFetch` is listed as deprecated in older SDK notices, but the 2011 Organization service still serves it. `pac modelbuilder build` uses it online today through this same engine. Power Tools cannot replace it without forking the engine, so accept it for v1. Current deprecation and removal status was not re-checked against learn.microsoft.com in this session.
- **`/messages` picker endpoint (new).** Use `RetrieveMultiple` with a `QueryExpression`, not `ExecuteFetch`. Apply the same criteria as the engine: `sdkmessage.isprivate = false`, an inner link to `sdkmessagepair` with `endpoint = '2011/Organization.svc'`, and an inner link to `sdkmessagefilter` with `isvisible = true`, `distinct`. Otherwise the picker offers messages the engine will not emit. Page with the paging cookie, and fall back to page numbers when no cookie comes back. `customapi` (`uniquename`, `isprivate`) is a separate, optional query. Treat "entity `customapi` does not exist" as an empty result, not a failure (see on-premises).
- **Settings file.** The engine has `writesettingsTemplateFile` (`wstf`). It deletes and rewrites `builderSettings.json` in the output directory from the effective settings. Use that instead of hand-writing the JSON, so the file matches what `pac` writes. `settingsTemplateFile` and `writesettingsTemplateFile` cannot be used together. The engine also creates the output and type folders itself (`Directory.CreateDirectory`). It never deletes `.cs` files, so the "never delete in v1" rule holds if Power Tools adds no delete step.

**Paging, batching, throttling and limits**

- No writes, no `ExecuteMultiple`, no transactions, no `$batch`. The total request count is small: a few metadata calls plus message pages. The request-count limit (6,000 per 5 minutes per user) is not a concern.
- The **execution-time** service-protection limit (combined 20 minutes per 5-minute window per user) can matter. Repeated unfiltered `RetrieveAllEntities` runs are expensive by Microsoft's own description. The global one-job lock helps.
- Online `ServiceClient` retries 429 service-protection faults automatically, waiting for `Retry-After` (`api-limits.md`). The Data8 on-premises client does not retry, but on-premises has no service-protection limits.
- **Timeouts (not in the research):**
  - On-premises: `OnPremiseClient` sets its operation timeout to **2 minutes** (`OnPremiseClient.cs:185`). Its `Timeout` property can be changed per instance. An unfiltered `RetrieveAllEntities` (`Entity | Attributes | Relationships`) on a large on-premises org can exceed 2 minutes. The job runner should raise `Timeout` on its own client instance (for example 10 minutes). This is safe because the factory creates a new client for each request.
  - Online: `ServiceClient` has its own connection timeout (believed to be about 4 minutes by default). It is set through `ServiceClient.MaxConnectionTimeout`, which is believed to be **static and process-wide**. Do not change it for one job. Rely on the table filter instead. Unverified in this session.
- Response size: an unfiltered read is tens of MB. On-premises WCF message-size limits in the Data8 claims-based binding were not checked. Unverified.

**Privileges and connection requirements**

- No `WhoAmI`, impersonation or `CallerId` is needed, and the engine sets none. Do not set `CallerId`, because the output depends only on metadata the caller can see.
- Table and choice metadata (`RetrieveAllEntities`, `RetrieveMetadataChanges`, `RetrieveAllOptionSets`) can be read by any licensed user. `organization.languagecode` read is in every role.
- **Unverified (the research claim is too broad):** "any user who can sign in has this" for `sdkmessage`, `sdkmessagepair`, `sdkmessagerequest(field)`, `sdkmessageresponse(field)`, `sdkmessagefilter` and `customapi`. These are organization-owned tables with their own read privileges. Whether a minimal custom role includes them was not confirmed.
  - Failure shape: the engine reads all metadata before writing anything. A privilege fault on the message queries aborts the whole run with exit code 2 and writes nothing. Surface the fault text, and suggest turning messages off.
- Token: `ExternalTokenManagement` with a fixed token captured per request. A run that outlives the token fails with 401 partway through the reads. This agrees with the research. It is acceptable for v1.

**Online versus on-premises**

- Both connection types reach the engine as `IOrganizationService`. That is `ServiceClient` online and Data8 `OnPremiseClient` (`IOrganizationServiceAsync2`) on-premises. Both share one `Microsoft.Xrm.Sdk` identity (see the assembly note below).
- On-premises, every request goes through Data8's own SOAP serializer (`DataContractSerializer` + `KnownTypesResolver`). The sidecar on main already sends typed `RetrieveAllEntitiesRequest` and `RetrieveMetadataChangesRequest` this way. **Unverified:** the engine's untyped `OrganizationRequest("RetrieveAllEntities")` / `("RetrieveAllOptionSets")` with an `EntityFilters` enum parameter, and `ExecuteFetchRequest`, through Data8. Add a serializer round-trip test for those request shapes. If possible, run one live on-premises check before release.
- **Custom APIs are online-only.** Dynamics 365 CE on-premises 9.x has no `customapi` table. That is believed but not re-checked against current docs. The message picker must not fail on-premises. Custom process actions (workflow `category = 3`) still appear as `sdkmessage` rows on both.
- On-premises 2-minute timeout: see above.

**Solution and managed limits**

- Not applicable to writes; the tool changes nothing in Dataverse. Metadata comes from the merged, published result of all solution layers. Managed and unmanaged layers do not affect the output.
- `pac modelbuilder` has no "tables in solution X" filter. Choosing tables by solution would be a Power Tools addition (`solutioncomponent`, `componenttype = 1`, resolved to logical names). It belongs in a later item, not v1 scope (A).

**Failure modes and partial success**

- `ModelBuilder.Invoke` catches `FaultException<OrganizationServiceFault>`, `MessageSecurityException` and `Exception`. It returns `2` and writes a one-line message to `Console.Error`, which is stderr. Confirmed. Electron drains sidecar stderr, so it cannot corrupt the stdout `LISTENING` handshake.
  - The fault detail, including the error code needed to tell privilege, throttling and timeout apart, goes only to the engine logger's `TraceError`. The runner's `ILogger` must capture Error level.
  - The `MessageSecurityException` branch dereferences `InnerException` without a null check. The runner must still wrap `Invoke` in its own `try`/`catch`.
- **Partial output.** The engine writes files in order: entities, messages, option sets, context. A failure while writing (an IO error or a read-only file) leaves the files already written. On failure, list the `*.cs` files whose write time is at or after the run start. Report "failed, N files were written". Do not report "nothing written".
- **Static state in Microsoft's engine (the research missed it, and it is a correctness bug for a long-lived sidecar):** `Utility.Utilites._locatedKeys` is a `static Dictionary` that caches the parsed `entitynamesfilter` and `messagenamesfilter` lists. It is never cleared. Confirmed in the source, and the field is present in the 2.0.16 DLL. **The second generation in the same sidecar process reuses the first run's table and message filters.** DLaB works around this by clearing the field by reflection before each run (`PacModelBuilderCodeGenHack.ClearMsUtilitiesCache`). `NamingService` and `CodeWriterFilterService` hold other static caches.
  - Required in v1, choosing one:
    - (a) Load ModelBuilderLib in a collectible `AssemblyLoadContext` per job. Note that `IOrganizationService` and `Microsoft.Xrm.Sdk` must stay in the default context so the client type is shared.
    - (b) Clear `_locatedKeys` by reflection before each run (clean-room, a few lines), and fail the job loudly if the field is not found.
  - Add a sidecar test: two runs in one process with different filters must use the second filter. Keep the global one-job lock in either case.
- `VerifyArguments()` result ignored: confirmed. The sidecar's own validation is the only gate.

**Assembly conflict (refines Recommended implementation step 1)**

- Both packages ship `Microsoft.Xrm.Sdk.dll` and `Microsoft.Crm.Sdk.Proxy.dll`. ModelBuilderLib has them under `lib/net6.0` and Dataverse.Client 1.2.10 under `lib/net8.0`. They have the **same assembly version (9.0.0.0) and the same file version (9.2.49.14828)**, read from the DLL metadata.
- So only one copy loads, and the researcher's "type identity / `MissingMethodException`" risk is low. The NuGet conflict resolver picks one copy. The spike is still worth doing, mainly to check that the single-file publish has no duplicate-path error.
- "Output identical to `pac`" holds for the same ModelBuilderLib version. The PAC CLI bundles its own engine version, which may be newer than 2.0.16. Show the engine version in the run log.

**Plugin claims that are wrong**

- The research credits the static caches only to DLaB's extensions. Microsoft's own engine also keeps static state, and `_locatedKeys` leaks filters between runs.
- "Metadata fetch in batches of 20 to 50 names" is listed as something to keep. Microsoft's engine uses 20. The 50-name `In` batch is DLaB's wildcard path, which is out of scope (A). Power Tools does no batching of its own.
- Table wildcard filters presented as a general capability. They are DLaB-only, and `pac` does not support them.
- The DLaB post-filter that removes `CreateMultiple`, `UpdateMultiple`, `DeleteMultiple` and `UpsertMultiple` must not be ported in scope (A), because `pac` output includes them.
- "Both packages ship their own `Microsoft.Xrm.Sdk.dll`, so watch for type identity problems" overstates it. The identities match (see above).

**Plugin claims that remain unverified**

- Read privileges on `sdkmessage*` and `customapi` for minimal roles.
- Current Microsoft deprecation and removal status of `ExecuteFetch`.
- That `customapi` is absent on every on-premises 9.x version.
- Data8 on-premises serialization of the engine's untyped requests and `ExecuteFetch`.
- `ServiceClient.MaxConnectionTimeout` default and whether it is static.
- Whether `RetrieveMetadataChanges` matching on `logicalname` is case-sensitive.
- The researcher's "Gotcha" line numbers in `MetadataProviderQueryService.cs` match source `04c1ff4`. Whether the 2.0.16 package differs from that source was checked only through DLL strings.
