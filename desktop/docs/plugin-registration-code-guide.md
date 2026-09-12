# Plugin Registration: code walkthrough and findings

Audit date: 5 September 2026. Repository checkpoint observed at the end of inspection: `f276640`.

This is a learning guide and read-only code assessment. No production code was changed for this assessment. It explains the current implementation, including behavior that is incomplete or deliberately disabled. The exact reported failure has not been reproduced because the failing action and error have not yet been supplied. Findings below are distinguished from a diagnosis of that particular failure.

## 1. What you have built

This feature is considerably more than a form that uploads a DLL. It combines a registration browser, a DLL metadata reader, five families of mutation workflows, dependency analysis, signed previews, optimistic concurrency checks, and recovery after uncertain network responses.

The overall architecture is sensible: React owns interaction, C# owns Dataverse operations, and a gateway isolates SDK calls. The main problems are repeated expensive reads, some disconnected validation and UI behavior, and features whose visible entry points imply more support than the backend currently provides.

Measured source size, excluding generated build files:

| Area | Files | Lines | Interpretation |
| --- | ---: | ---: | --- |
| Tool UI production TypeScript/TSX | 28 | 2,200 | Screens, dialogs, hooks, contracts, tree logic |
| Tool UI tests | 13 | 2,053 | Almost half the UI folder is tests |
| API feature C# including DTOs | 30 | 5,145 | SDK access, validation, inspection, mutation orchestration |

The largest backend files are the assembly inspector (897 lines), Dataverse gateway (750), endpoints (552), and plan signer (312). The page component is 361 lines. Line count alone does not establish bloat: signature validation and tests naturally occupy space. Repeated responsibilities and unnecessary network work are better targets.

## 2. Understand the Dataverse objects first

Consider a DLL named `Contoso.Plugins.dll` containing an `AccountValidator` class and a `CalculateDiscount` workflow activity.

```text
Contoso.Plugins                       pluginassembly: uploaded DLL registration
├── Contoso.AccountValidator          plugintype: ordinary plug-in class
│   └── Update of account             sdkmessageprocessingstep: when to run
│       └── PreAccount                sdkmessageprocessingstepimage: snapshot
└── Contoso.CalculateDiscount         plugintype: workflow activity class
```

An assembly is the container. A plug-in class is a handler. A step supplies the event, table, pipeline stage, execution mode, and order. An image supplies selected record attributes to that step. Uploading a DLL and creating a step are separate operations in this tool.

Both ordinary plug-ins and workflow activities are stored as `plugintype` records, but the UI distinguishes them. Workflow activity nodes have no step children. Their argument information is loaded separately when selected.

Two different “versions” matter:

* Assembly version, such as `1.0.0.0`, comes from the DLL identity.
* Dataverse `versionnumber` is a record concurrency value. It answers whether the record changed since it was read.

The SHA-256 value identifies DLL content. Two files can have the same assembly version and different hashes.

## 3. The complete request path

```text
User interaction
  → PluginRegistration.tsx and the relevant dialog
  → feature API hook
  → shared HTTP client and selected connection
  → local ASP.NET Core endpoint
  → operation service and validators
  → DataversePluginRegistrationGateway
  → Dataverse SDK request
  → response mapping / verification
  → UI outcome banner and catalog refresh
```

Electron starts the local API process, chooses its loopback port, and supplies a per-launch local secret. The feature uses the existing HTTP/connection infrastructure; there is no dedicated Plugin Registration IPC protocol to learn.

Start with [the tool manifest](E:/dev/src/PowerTools/desktop/src/ui/tools/plugin-registration/tool.ts), [shared HTTP client](E:/dev/src/PowerTools/desktop/src/ui/shared/api/client.ts), [sidecar lifecycle](E:/dev/src/PowerTools/desktop/src/electron/sidecar.ts), and [API service registration](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Program.cs).

A useful debugging distinction: a failure before the endpoint is reached is a connection/transport problem; a preflight blocker is a validation decision; a rejected SDK request is a Dataverse operation problem; a failed verification may happen after the write has succeeded.

## 4. Reading and displaying the catalog

Read [useRegistrationCatalog.ts](E:/dev/src/PowerTools/desktop/src/ui/tools/plugin-registration/api/useRegistrationCatalog.ts), then [PluginRegistrationCatalogService.cs](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationCatalogService.cs).

1. Selecting a connection enables a React Query request to `/api/plugin-registration/catalog`.
2. The cache key includes the connection name. Catalog data is considered fresh for 30 seconds.
3. The endpoint creates a gateway for the selected Dataverse connection.
4. `RetrieveCatalogRowsAsync` reads assemblies, types, steps, and images in four sequential, pageable queries.
5. The catalog service groups images by step, steps by type, and types by assembly, then returns a nested DTO.
6. The renderer normalizes the DTO and `buildCatalogTree` adds labels and IDs such as `step:<guid>`.
7. `RegistrationWorkspace` handles search/loading/error states. `RegistrationTree` and `RegistrationTreeNode` display the hierarchy; `RegistrationDetails` displays the selection.

Search operates on the already-loaded tree. A matching descendant retains its ancestors. Search forces expansion of matching branches. There is no server request for each expansion.

The ordinary catalog excludes DLL content and secure configuration values. Selecting a workflow activity is more expensive: the details service reads catalog rows, retrieves its assembly content and dependencies, and inspects the DLL to extract arguments.

Important files: [catalog queries](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationCatalogQueries.cs), [tree model](E:/dev/src/PowerTools/desktop/src/ui/tools/plugin-registration/model/catalogTree.ts), [workspace](E:/dev/src/PowerTools/desktop/src/ui/tools/plugin-registration/components/RegistrationWorkspace.tsx).

## 5. What the main page actually controls

[PluginRegistration.tsx](E:/dev/src/PowerTools/desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx) coordinates:

* Selected connection, selected node, expanded nodes, context menu, and dialog intent.
* Catalog and workflow detail queries.
* Which dialog receives which assembly, handler, step, or image.
* Mutation outcome messages and post-write catalog refresh.
* Cascade unregister previews and confirmation.

`DialogIntent` is a tagged union: for example `{ kind: "createStep", pluginId }`. The page resolves the ID to a tree node and renders the relevant dialog. This avoids passing entire mutable objects through every menu action, but the many derived conditions make the page difficult to follow.

Single click selects/expands, right click opens actions, and double click sets an update intent. After a mutation, the page parses its outcome, closes the dialog, refreshes the catalog, and tries to select the affected record.

Keep this page open beside the dialog when debugging a UI issue. The dialog performs the request; the page determines what happens afterward.

## 6. Registering or updating a DLL, step by step

Read [AssemblyDialog.tsx](E:/dev/src/PowerTools/desktop/src/ui/tools/plugin-registration/components/dialogs/AssemblyDialog.tsx), [useAssemblyMutations.ts](E:/dev/src/PowerTools/desktop/src/ui/tools/plugin-registration/api/useAssemblyMutations.ts), and [PluginAssemblyMutationService.cs](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginAssemblyMutationService.cs).

### A. Analyze

Choosing a file sends multipart form data to `/assemblies/analyze`. The inspector reads PE/CLR metadata without executing the uploaded assembly. It checks size and strong-name signing, calculates the hash, identifies classes and workflow arguments, and produces compatibility diagnostics. The current limit is 16 MiB.

The inspector includes its own low-level signature verification, metadata traversal, and workflow attribute parsing. That explains much of its size. Treat it as a specialized module; it is not the best first place to simplify an ordinary step-registration problem.

### B. Preview

The UI builds a draft containing the operation, target assembly, options, inspection, and expected record versions. It uploads the file again to the register/update preflight route.

The service re-inspects the actual bytes, reads the catalog, checks expected versions, and computes impact. For updates it also retrieves and inspects the stored assembly and reads handler dependencies.

`PluginAssemblyDiff` compares identities, hashes, handler names, and workflow contracts. Removing a class that still owns steps/images or has dependencies produces blockers. `WorkflowContractComparer` identifies breaking argument changes for referenced workflow activities.

“Changed plug-in” here does not mean a method-level code diff. A changed assembly identity/hash causes retained plug-in classes to be classified as changed.

### C. Execute

Confirmation uploads the DLL a third time with the draft and signed token. The server re-inspects, rebuilds impact, validates the token against fresh state, and then calls the gateway once for the mutation.

The gateway creates or updates a `pluginassembly` entity. It does not explicitly iterate over inspected handlers and create `plugintype` entities. The service subsequently expects the registered handler set to match the inspection. Whether that complete lifecycle works in the connected environment needs live verification; fake gateway tests alone cannot establish it.

### D. Verify

The service reads the catalog and stored content again. It checks assembly identity, options, a newer record version, content hash/size, and handler names. A successful SDK response is therefore not sufficient for a verified-success outcome.

This distinction matters when the UI reports uncertainty: inspect the environment before attempting another create.

## 7. The shared preview and execution machinery

[PluginRegistrationPreflightService.cs](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationPreflightService.cs) creates a stable request digest and binds it to environment, operation, target, record versions, DLL hash where applicable, and capabilities.

[PluginRegistrationPlanSigner.cs](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationPlanSigner.cs) signs that binding. The default lifetime is five minutes. This is an expiring approval of a specific change, not a saved job or rollback record.

At execution the server validates the submitted binding and then rereads current state. Changed inputs, expired tokens, or changed records invalidate the plan. Several distinct causes currently collapse into the same “stale plan” error.

[VerifiedMutationExecutor.cs](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/VerifiedMutationExecutor.cs) runs three operation-specific callbacks: mutate once, reconcile after a communication failure, and verify by reading state.

| Outcome | Meaning |
| --- | --- |
| `succeededAndVerified` | Write returned and readback matched expectations |
| `reconciledAfterCommunicationFailure` | Write response failed, but subsequent reads support success |
| `rejectedBeforeCompletion` | Executor classified the operation as rejected |
| `outcomeUncertain` | Available evidence could not establish the expected result |

The reconciliation timeout defaults to ten seconds. Mutation hooks disable retries and set `noAuthRetry`, preventing the shared client from automatically replaying a write during authentication recovery. These are useful protections to retain when simplifying the implementation.

## 8. Steps, images, workflow activities, and deletion

| Operation | Main files and behavior |
| --- | --- |
| Step create/update | [StepDialog](E:/dev/src/PowerTools/desktop/src/ui/tools/plugin-registration/components/dialogs/StepDialog.tsx) → [PluginStepMutationService](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginStepMutationService.cs) → [PluginStepValidator](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginStepValidator.cs). Validates message/filter, stage/mode, attributes, users, managed state, duplicates, versions. |
| Step enable/disable/delete | Same service with another operation string. Existing values are reconstructed; deletion checks dependencies and exact typed name. Gateway uses transactional SDK requests and row-version checks for updates/deletes. |
| Secure configuration | UI supplies only a replacement value. Existing secret values are not returned for editing. Gateway creates/updates secure configuration and links it to the step in the transaction. |
| Image create/update/delete | [PluginImageMutationService](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginImageMutationService.cs) and [PluginImageValidator](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginImageValidator.cs). Check alias, columns, image type, stage, parent and image versions. Current validator supports Create/Delete/Update messages only and requires explicit columns. |
| Workflow activity metadata update | [WorkflowActivityMutationService](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/WorkflowActivityMutationService.cs) updates name, friendly name, group, description. It does not edit workflow definitions or DLL code. |
| Assembly/class unregister | [PluginRegistrationDependencyService](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationDependencyService.cs) builds the owned hierarchy; [PluginRegistrationCascadeService](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationCascadeService.cs) plans image → step → type → assembly deletion, checks external dependencies and capability, then would execute one transaction. Currently disabled. |

For step and image edits, the target ID is also inferred from `ExpectedVersions`: remove the parent ID and require exactly one remaining ID. Endpoint helpers repeat this check against the route. This works as a convention but unnecessarily couples identity to concurrency metadata. An explicit target ID would be easier to understand.

## 9. Findings and their practical effects

### F1. Assembly and handler unregister are intentionally unavailable

**Confirmed source behavior.** [Gateway line 22](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/DataversePluginRegistrationGateway.cs:22) always reports transaction support as false. [Capability service](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationCapabilityService.cs) also defaults release approval to false. Normal startup enables neither.

The menu still offers unregister, and the preflight reports a blocker. This is an unfinished release capability, not evidence that every registration operation is broken. The [release checklist](E:/dev/src/PowerTools/desktop/docs/qa/plugin-registration-release-checklist.md) explicitly records missing disposable-environment proof.

**Next step:** make availability visible before the user begins the workflow. Enable it only after proving the exact transaction behavior; do not replace it with sequential deletes merely to make the button work.

### F2. Double-clicking an ordinary plug-in class opens a placeholder

**Confirmed source behavior.** `openNodeDialog` creates an update intent for every node. Ordinary plug-in classes do not match a real edit dialog and fall through to [RegistrationDialogShell](E:/dev/src/PowerTools/desktop/src/ui/tools/plugin-registration/components/dialogs/RegistrationDialogShell.tsx), whose text says saving is not connected.

The plug-in context menu correctly has no update action, making double-click inconsistent with the menu. Cascade intents also reach this fallback shell while the actual cascade flow is rendered, creating overlapping modal flows.

**Next step:** define supported actions per node once and use the same rules for menus and double-click. Remove the placeholder from completed flows.

### F3. Cascade previews can survive a change of target

**Static correctness finding; no interaction reproduction added in this audit.** The mutation hook lives at page scope. [CascadeUnregisterFlow](E:/dev/src/PowerTools/desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx:312) reads `mutations.preflight.data` without checking its target. Closing the dialog or changing connection does not reset that mutation state.

Reproduction to test: preview assembly A, cancel, then open unregister for B. The component can display A's impact with B's current target/draft. Token binding should reject the mismatched execution; the visible preview is still wrong. This also matters before cascade is enabled because blocked previews persist.

**Next step:** put preview state inside a dialog keyed by connection and target, or explicitly reset and validate its binding. Add a two-target and two-connection test.

### F4. Step operations repeatedly load far more metadata than they need

**Confirmed call structure; real-world latency not measured.** [RetrieveStepOptionsAsync](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/DataversePluginRegistrationGateway.cs:59) reads messages, filters, enabled users, then sequentially retrieves entity and attribute metadata for every distinct primary table. `RetrieveStepPreflightStateAsync` calls it again.

The step service reads the complete catalog before asking the gateway for preflight state, which reads the complete catalog again. Execution performs initial validation and fresh validation, then verification can invoke the same expensive state loader again. The UI's edit-details call also loads all step options.

Consequently, editing one account step can repeatedly scan unrelated tables and registrations. The current `none` metadata exclusion avoids one invalid lookup but does not eliminate this broad work.

**Next step:** separate lightweight message/filter choices from selected-table metadata. Read the selected parent/step directly. Reuse one coherent snapshot inside a validation phase while retaining a fresh check immediately before writing.

### F5. Some errors are too generic to guide a fix

**Confirmed source behavior.** [PluginRegistrationProblem](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationProblem.cs) maps SDK faults to a generic Dataverse rejection and all preflight failures to stale-plan text. It preserves a correlation ID when available, but loses distinctions such as expired token versus changed state.

`StepDialog` does not render an options-query error. If options fail, fields can remain empty and preview disabled without explaining why. Assembly analysis/preflight errors also share a generic “could not be analyzed” label.

**Next step:** preserve safe structured reason codes, show options loading/error states, and retain redacted diagnostics at the operation boundary. Do not expose raw tokens, configuration, or request bodies.

### F6. Framework diagnostics are produced but not enforced by the mutation path

**Static validation gap.** The inspector's `BuildDiagnostics` returns error-severity diagnostics for unsupported framework/runtime values. It still returns the inspection. The renderer's `AssemblyInspection` interface omits diagnostics, the assembly diff does not turn those diagnostics into blockers, and the mutation service does not reject them before writing.

The current supported-framework constant is `.NETFramework,Version=v4.6.2`; that is an implementation policy, not a claim about every current Dataverse deployment. An unsupported-framework fixture test for inspection alone does not prove registration is blocked.

**Next step:** decide the intended compatibility policy, surface diagnostics, and test the full preflight/execute path with an error-severity inspection. Enforce the agreed policy in the backend.

### F7. Image verification depends on an extra parent write

**Confirmed implementation; platform behavior requires live proof.** The gateway prepends an empty-attribute `UpdateRequest` for the parent step with a row version to image transactions. Verification expects the parent version to increase.

That makes image success depend on both an image write and the exact handling of a parent update with no changed attributes. A mocked transaction response cannot prove this behavior on Dataverse.

**Next step:** verify this precise request/readback sequence in a disposable environment before treating it as a reliable concurrency mechanism.

### F8. Large-catalog tests do not establish large-screen performance

**Confirmed test scope.** The renderer large-catalog test constructs and searches 31,100 in-memory nodes. It does not mount and paint that many DOM nodes. The tree recursively renders expanded branches without virtualization; a broad search forces expansion.

**Next step:** measure a rendered broad search and scrolling before choosing virtualization. The more immediate performance issue is the repeated network metadata loading in F4.

## 10. What to simplify, and what to keep

Keep the renderer/API boundary, typed contracts, metadata-only DLL inspection, credential isolation, no automatic mutation replay, fresh concurrency validation, and honest uncertainty reporting. These solve real problems.

Simplify in this order:

1. Correct misleading/placeholder actions, option errors, and stale dialog state. These are small UI changes with focused tests.
2. Replace broad per-operation catalog/metadata reloads with targeted reads. Measure request counts and latency before and after.
3. Split the 750-line gateway by responsibility: catalog reads, step metadata, and mutation SDK requests. Keep interfaces specific to their callers instead of creating a generic CRUD framework.
4. Extract dialog routing and outcome handling from the page. Keep each dialog's preview tied to its target and connection.
5. Give mutation targets explicit IDs rather than extracting identity from version dictionaries.
6. Standardize endpoint error handling. Assembly services are manually constructed in an endpoint helper while other services use dependency injection; the assembly helper also bypasses the registered mutation executor. Use one construction pattern.

Avoid a broad rewrite before establishing which operation fails. It would remove useful tests and introduce many new variables at once.

## 11. How to investigate your next failure

| Symptom | Start here | Evidence to capture |
| --- | --- | --- |
| Catalog never loads | Catalog hook → endpoint → four query builders | Failing query/table, safe fault code, correlation ID |
| DLL selection fails | Analyze endpoint and assembly inspector | Inspection validation code; file framework/signing details |
| Preview rejects a DLL | Assembly mutation service and diff | Blocker codes, expected/current versions, safe diagnostic codes |
| Step form empty or slow | Options endpoint and `RetrieveStepOptionsAsync` | Per-phase timings, number of metadata requests, options-query error |
| Confirm fails | Execute endpoint, token validation, gateway | Whether the SDK write was reached; reason code |
| “Outcome uncertain” | Executor and operation-specific `Verify` | Whether target exists and which expected field did not match |
| Unregister assembly blocked | Capability service | Expected disabled behavior in this checkout |
| Wrong impact after cancel/reopen | Page-level cascade mutation state | Previous versus current target/connection |

For an `AccountValidator` step bug, read one vertical path: `StepDialog` → `useStepMutations` → step endpoint helper → `PluginStepMutationService` → `PluginStepValidator` → gateway step methods. You do not need to understand the strong-name verifier or workflow contract comparer first.

## 12. Verification performed and limits

Fresh credential-free results from this audit:

| Check | Result |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run src/ui/tools/plugin-registration` from the desktop directory | 13 files, 69 tests passed |
| `dotnet test api/PowerTools/PowerTools.API.PluginRegistration.Tests/PowerTools.API.PluginRegistration.Tests.csproj -c Release --no-restore --verbosity quiet` from repository root | 174 passed, 0 failed, 0 skipped |

The first API attempt was blocked by sandbox access to Windows SDK discovery. After that was resolved, Debug output was locked by the running API process. Release configuration completed successfully without stopping that process.

No live Dataverse mutation, complete desktop aggregate, packaging test, or new interaction reproduction was run. Existing tests establish their covered fake scenarios, not a working live registration lifecycle. No production fix is claimed.

The checkout contained uncommitted gateway/dialog/test work at the start and was clean at a later checkpoint, before this document was added. This audit did not commit, revert, or alter those files. Findings describe the source read during the audit, including the existing fixes.

Historical context used only as a search lead: a previous catalog failure involved requesting `iscustomizable` on `plugintype`. The current gateway derives type customizability from managed state and the current query omits that field. That earlier fault should not be assumed to explain the present symptom.

## 13. Recommended reading order

1. This guide's hierarchy and request path.
2. [PluginRegistration.tsx](E:/dev/src/PowerTools/desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx): interaction and dialog selection.
3. [Catalog service](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationCatalogService.cs): how rows become the tree.
4. One dialog and its matching hook, preferably the step flow.
5. [Endpoints](E:/dev/src/PowerTools/api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationEndpoints.cs): transport and service entry points.
6. The matching operation service, then its validator and gateway methods.
7. Preflight service and verified executor: shared guarantees.
8. Assembly inspector and plan signer internals only when the failure reaches them.

The immediate objective should be one clearly reproduced operation with useful errors and a focused regression test. Once that path is understood and working, simplify its repeated reads and orchestration in small, independently verifiable changes.
