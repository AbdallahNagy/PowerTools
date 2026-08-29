# Plugin Registration Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a safe built-in PowerTools module that completely browses and manages Dataverse plug-in assemblies, plug-in classes, custom workflow activities, steps, and images with exact preflight previews, explicit confirmation, concurrency protection, and verified mutations.

**Architecture:** Keep React UI, models, API hooks, and tests private to `desktop/src/ui/tools/plugin-registration/`. Put all Dataverse registration behavior in the ASP.NET Core sidecar under `api/PowerTools/PowerTools.API/Tools/PluginRegistration/`; use the existing connection filter, client factory, and authenticated renderer API client. Every mutation is a two-call preflight/execute workflow bound by a short-lived signed plan token, followed by Dataverse readback verification. Electron main/preload receive no new registration IPC.

**Tech Stack:** Windows, Electron, React 19, TypeScript, TanStack Query, Axios, Tailwind CSS, `react-resizable-panels`, Vitest, React Testing Library, `user-event`, MSW, Playwright, ASP.NET Core/.NET 9, Dataverse SDK, `System.Reflection.Metadata`, xUnit.

**Spec:** `desktop/docs/superpowers/specs/2026-08-29-plugin-registration-tool-design.md`

## Global Constraints

- Preserve the current uncommitted Plugin Registration shell, registry entry, and icon work; inspect `git status --short` before every task and stage only that task's named files.
- Read the closest `AGENTS.md` before changing a subsystem. Keep renderer code tool-private and use only public shared connection, status, UI, and API contracts.
- Do not add raw Electron, preload, IPC, token, shell, or cross-tool dependencies. A browser file input posts DLL bytes to the existing loopback sidecar.
- Treat DLLs as hostile input. Inspect only metadata; never call `Assembly.Load`, `AssemblyLoadContext.LoadFromAssemblyPath`, reflection over loaded types, constructors, module initializers, or static initializers.
- Never persist or log DLL bytes, access tokens, secure configuration, raw request payloads, or stack traces. Bind assembly plans to SHA-256 and discard request bytes when the request completes.
- Load the complete registration catalog with four pageable queries before presenting it as ready. Exclude assembly `content` and secure-configuration values.
- Keep online assembly storage/isolation fixed to Database/Sandbox. Show on-premises choices only when a capability response proves they are supported.
- No global inspect/edit mode, rollback, restore point, action history, saved snapshots, or saved previous DLLs.
- All writes require a fresh preflight, an explicit confirmation, plan revalidation, matching `versionnumber` values, a single non-retried execute request, and readback verification.
- A lost mutation response must trigger reconciliation, not an automatic retry. Never invite a blind second mutation when the result is uncertain.
- Cascades may delete owned images, steps, and selected types. They must never silently delete workflows, actions, Custom APIs, managed components, non-customizable components, or other external solution components.
- Do not enable cascade unregister unless the disposable-environment capability smoke proves one `ExecuteTransactionRequest` can atomically delete the full supported hierarchy. There is no sequential fallback.
- Write a failing focused test before each behavior change, run it to observe the intended failure, implement the minimum behavior, rerun the focused test, then run the relevant API or desktop aggregate gate.
- Use credential-free fakes/MSW for normal automation. Windows sidecar publish, Electron smoke, and the opt-in disposable Dataverse test are release gates.
- Commit after each task with only the task's files staged. If unrelated user changes overlap a named file, stop and separate the intended hunk before staging.

---

### Task 1: Establish the focused sidecar test project and registration contracts

**Files:**

- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/PowerTools.API.PluginRegistration.Tests.csproj`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Contracts/CatalogContractTests.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/Dtos/CatalogDtos.cs`
- Modify: `api/PowerTools/PowerTools.sln`

**Interfaces:**

- Produces: a normal xUnit project discovered by `dotnet test api/PowerTools/PowerTools.sln`.
- Produces: immutable sidecar DTOs for `PluginRegistrationCatalog`, `PluginAssembly`, `PluginHandler`, `PluginStep`, `PluginImage`, `WorkflowArgument`, and `ComponentDependency`.
- Preserves: the existing executable `PowerTools.API.Tests` manual harness; do not convert or remove it.

- [ ] Add a focused xUnit project referencing `PowerTools.API` and include these package references:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.12.0" />
    <PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" Version="9.0.0" />
    <PackageReference Include="xunit" Version="2.9.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2">
      <PrivateAssets>all</PrivateAssets>
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
    </PackageReference>
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\PowerTools.API\PowerTools.API.csproj" />
  </ItemGroup>
</Project>
```

- [ ] Add the project to `PowerTools.sln`, then write a contract test that requires direct assembly-to-handler nesting and distinguishes ordinary plug-ins from workflow activities:

```csharp
[Fact]
public void Catalog_contract_keeps_handlers_directly_below_assembly()
{
    var plugin = new PluginHandlerDto(
        Guid.NewGuid(), HandlerKind.Plugin, "Contoso.ValidateAccount",
        "ValidateAccount", null, null, null, false, true, 3,
        [], [], []);
    var workflow = plugin with {
        Id = Guid.NewGuid(),
        Kind = HandlerKind.WorkflowActivity,
        TypeName = "Contoso.CalculateDiscount",
        Name = "CalculateDiscount",
        WorkflowActivityGroupName = "Contoso"
    };
    var assembly = new PluginAssemblyDto(
        Guid.NewGuid(), "Contoso.Plugins", "1.2.0.0", "neutral", "31bf3856ad364e35",
        2, 0, false, true, 7, [plugin, workflow]);

    Assert.Equal([HandlerKind.Plugin, HandlerKind.WorkflowActivity],
        assembly.Handlers.Select(handler => handler.Kind));
}
```

- [ ] Run `dotnet test api/PowerTools/PowerTools.API.PluginRegistration.Tests/PowerTools.API.PluginRegistration.Tests.csproj` and verify the compile fails because the DTOs do not exist.
- [ ] Add `CatalogDtos.cs` with explicit JSON-shaped records. Use `HandlerKind.Plugin` and `HandlerKind.WorkflowActivity`; include IDs, hierarchy links, labels, enabled state, managed/customizable state, solution display data, `versionnumber`, secure-config presence only, workflow argument contracts, and dependency summaries. Do not add assembly content or a secure-config string property.
- [ ] Run the focused test and verify it passes. Run `dotnet test api/PowerTools/PowerTools.sln` to prove the new project and the existing manual harness coexist.
- [ ] Commit only the solution, new test project, contract test, and DTO file:

```powershell
git -c safe.directory=E:/dev/src/PowerTools add api/PowerTools/PowerTools.sln api/PowerTools/PowerTools.API.PluginRegistration.Tests api/PowerTools/PowerTools.API/Tools/PluginRegistration/Dtos/CatalogDtos.cs
git -c safe.directory=E:/dev/src/PowerTools commit -m "test: establish plugin registration contracts"
```

### Task 2: Retrieve and assemble the complete read-only catalog

**Files:**

- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/IPluginRegistrationGateway.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/DataversePluginRegistrationGateway.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationCatalogQueries.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationCatalogService.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationEndpoints.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Support/FakePluginRegistrationGateway.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Catalog/PluginRegistrationCatalogServiceTests.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Catalog/PluginRegistrationCatalogQueriesTests.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Catalog/PluginRegistrationEndpointsTests.cs`
- Modify: `api/PowerTools/PowerTools.API/Program.cs`

**Interfaces:**

- Adds: `GET /api/plugin-registration/catalog` under `DataverseContextFilter`.
- Produces: `IPluginRegistrationGateway.RetrieveCatalogRowsAsync(CancellationToken)` and a factory that wraps the request-scoped `IOrganizationServiceAsync2`.
- Guarantees: four focused pageable reads for `pluginassembly`, `plugintype`, `sdkmessageprocessingstep`, and `sdkmessageprocessingstepimage`; the response is returned only after all four are complete.

- [ ] Write catalog-query tests asserting assembly columns do not contain `content`, step columns do not contain secure values, each query has paging enabled, and each query selects only the approved columns.
- [ ] Write service tests using `FakePluginRegistrationGateway` for multiple pages, out-of-order rows, orphan protection, ordinary plug-in classification, workflow-activity classification, stable alphabetical ordering, image nesting, and `secureConfigExists` without a value.
- [ ] Add a `WebApplicationFactory<Program>` route-contract test that supplies test `port`/`secret` configuration and asserts one `GET /api/plugin-registration/catalog` endpoint is mapped. Add `public partial class Program { }` after the top-level program so the test host can address the entry point. Run the focused project and verify it fails because the gateway, service, and endpoint are missing.
- [ ] Implement the narrow contracts:

```csharp
public interface IPluginRegistrationGateway
{
    Task<PluginRegistrationRows> RetrieveCatalogRowsAsync(CancellationToken cancellationToken);
}

public interface IPluginRegistrationGatewayFactory
{
    IPluginRegistrationGateway Create(IOrganizationServiceAsync2 service);
}

public sealed record PluginRegistrationRows(
    IReadOnlyList<PluginAssemblyRow> Assemblies,
    IReadOnlyList<PluginTypeRow> Types,
    IReadOnlyList<PluginStepRow> Steps,
    IReadOnlyList<PluginImageRow> Images);
```

- [ ] Implement `RetrieveAllPagesAsync(QueryExpression, CancellationToken)` so it copies the paging cookie and page number until `MoreRecords` is false. Execute all four reads through the request-scoped client and return only after every read succeeds; do not expose partial rows when any read fails.
- [ ] Classify a handler as a workflow activity from Dataverse workflow-activity metadata, not from display-name guessing. Nest handlers directly under the assembly, steps only under ordinary plug-ins, and images only under their step.
- [ ] Map the endpoint from `Program.cs` with `app.MapPluginRegistrationEndpoints()` and register the gateway factory/catalog service. Use the existing `DataverseContextFilter`, `DataverseClientFactory`, and `ctx.CreateDataverseClient(factory)` path.
- [ ] Run the focused xUnit project, then `dotnet test api/PowerTools/PowerTools.sln`.
- [ ] Commit the catalog vertical slice:

```powershell
git -c safe.directory=E:/dev/src/PowerTools add api/PowerTools/PowerTools.API/Program.cs api/PowerTools/PowerTools.API/Tools/PluginRegistration api/PowerTools/PowerTools.API.PluginRegistration.Tests/Catalog api/PowerTools/PowerTools.API.PluginRegistration.Tests/Support
git -c safe.directory=E:/dev/src/PowerTools commit -m "feat: expose plugin registration catalog"
```

### Task 3: Add the renderer catalog model, connection isolation, and local search

**Files:**

- Create: `desktop/src/ui/tools/plugin-registration/model/contracts.ts`
- Create: `desktop/src/ui/tools/plugin-registration/model/catalogTree.ts`
- Create: `desktop/src/ui/tools/plugin-registration/api/useRegistrationCatalog.ts`
- Create: `desktop/src/ui/tools/plugin-registration/tests/node/catalogTree.test.ts`
- Create: `desktop/src/ui/tools/plugin-registration/tests/renderer/api.test.tsx`

**Interfaces:**

- Produces: `useRegistrationCatalog(connectionName)` with query key `['plugin-registration', 'catalog', connectionName]`.
- Produces: pure `buildCatalogTree`, `filterCatalogTree`, and `findCatalogNode` functions.
- Guarantees: switching connections clears selection/expanded state in the page component, cancels obsolete reads through TanStack Query, and never labels partial data as complete.

- [ ] Write node tests for the direct hierarchy, display prefixes `(Plugin)`, `(Workflow Activity)`, `(Step)`, and `(Image)`, stable IDs, search matches at every level, ancestor retention for a matching descendant, and no mutation of the original DTO.
- [ ] Write an MSW hook test that installs two named fake connections, renders `useRegistrationCatalog('Development')`, and asserts the request carries the Development environment header and the cache key contains the connection name.
- [ ] Add a refresh test using `queryClient.invalidateQueries` and a connection-switch test proving the old environment result is not shown under the new key. Run `npm test -- src/ui/tools/plugin-registration` from `desktop/` and verify the new imports fail.
- [ ] Define TypeScript contracts that exactly mirror `CatalogDtos.cs`; use discriminated `kind: 'plugin' | 'workflowActivity'` and node kinds `assembly | plugin | workflowActivity | step | image`.
- [ ] Implement the hook without write retries:

```ts
export function useRegistrationCatalog(connectionName: string | null) {
  return useQuery({
    queryKey: ["plugin-registration", "catalog", connectionName],
    queryFn: ({ signal }) => apiGet<PluginRegistrationCatalog>(
      "/api/plugin-registration/catalog",
      { signal, meta: { connectionName: connectionName ?? undefined } },
    ),
    enabled: Boolean(connectionName),
    staleTime: 30_000,
  });
}
```

- [ ] Implement local case-insensitive matching across assembly/type/step/image names, full class name, workflow group, message, table, stage, and aliases. Retain each matching node's ancestors and matching descendants.
- [ ] Run the focused node and renderer tests, then `npm run typecheck` and `npm run lint -- --max-warnings 0` from `desktop/`.
- [ ] Commit only the private model, hook, and tests:

```powershell
git -c safe.directory=E:/dev/src/PowerTools add desktop/src/ui/tools/plugin-registration/model desktop/src/ui/tools/plugin-registration/api desktop/src/ui/tools/plugin-registration/tests/node desktop/src/ui/tools/plugin-registration/tests/renderer/api.test.tsx
git -c safe.directory=E:/dev/src/PowerTools commit -m "feat: load and search plugin catalog"
```

### Task 4: Build the approved three-region read-only workspace

**Files:**

- Modify: `desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx`
- Modify: `desktop/src/ui/tools/plugin-registration/tool.ts`
- Create: `desktop/src/ui/tools/plugin-registration/components/PluginRegistrationHeader.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/components/RegistrationWorkspace.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/components/RegistrationTree.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/components/RegistrationTreeNode.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/components/RegistrationDetails.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/components/RegistrationContextMenu.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/components/dialogs/RegistrationDialogShell.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/tests/renderer/pluginRegistration.test.tsx`

**Interfaces:**

- Header: connection selector and icon-only refresh on the left; `Register assembly` on the right.
- Main: resizable two-thirds hierarchy and one-third read-only details using `Group`, `Panel`, and `Separator` from `react-resizable-panels`.
- Interaction: single click selects and toggles immediate expansion; double click opens the node's modal shell; right click opens a styled type-specific menu.
- Details: no edit or unregister buttons.

- [ ] Write Testing Library tests for the connection header, accessible refresh icon, initial `66.666%` left panel, search, loading/error/empty states, hierarchy prefixes, single-click selection/expansion, double-click dialog, right-click menu items by node type, Escape/outside-click menu dismissal, keyboard focus, and read-only details.
- [ ] Explicitly assert the details pane has no `Edit`, `Update`, or `Unregister` button. Assert the assembly menu offers update/unregister, plug-in offers register-step/unregister, step offers update/register-image/enable-disable/unregister, image offers update/unregister, and workflow activity offers update/unregister.
- [ ] Run `npm test -- src/ui/tools/plugin-registration/tests/renderer/pluginRegistration.test.tsx` and verify it fails against the current connection-only shell.
- [ ] Implement the top-level state boundary:

```ts
type DialogIntent =
  | { kind: "registerAssembly" }
  | { kind: "update"; nodeId: string }
  | { kind: "createStep"; pluginId: string }
  | { kind: "createImage"; stepId: string }
  | null;

const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
const [dialogIntent, setDialogIntent] = useState<DialogIntent>(null);
```

- [ ] On connection change, clear selected node, expanded IDs, menu, and dialog before the new query can render. Use the hook's `refetch()` for the icon button and disable it while no connection is selected or a refresh is in progress.
- [ ] Build the hierarchy without an intermediate Plug-ins group. Use buttons with `aria-expanded`, `aria-selected`, `aria-level`, and distinct but restrained PowerTools typography. Single click performs both selection and immediate expansion toggling; suppress the second single-click action when dispatching the double-click modal.
- [ ] Implement a plugin-private context menu positioned within the viewport. Keep action callbacks as intents only; no mutation API is connected in this task.
- [ ] Reuse shared `SearchInput`, `Button`, `Modal`, `Spinner`, and `ToastProvider`. Set the tool tooltip to `Browse and safely manage Dataverse plug-in registrations`; preserve the existing tool ID, icon, activity visibility, and multi-instance policy.
- [ ] Run all focused Plugin Registration tests, then `npm run check` from `desktop/`.
- [ ] Commit the read-only workspace while preserving the existing shell/registry work:

```powershell
git -c safe.directory=E:/dev/src/PowerTools add desktop/src/ui/tools/plugin-registration
git -c safe.directory=E:/dev/src/PowerTools commit -m "feat: build plugin registration workspace"
```

### Task 5: Inspect hostile DLLs with metadata-only APIs

**Files:**

- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/Dtos/AssemblyInspectionDtos.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/IPluginAssemblyInspector.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginAssemblyInspector.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/AssemblyInspection/PluginAssemblyInspectorTests.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/TestFixtures/MixedRegistrationAssembly/MixedRegistrationAssembly.csproj`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/TestFixtures/MixedRegistrationAssembly/Handlers.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/TestFixtures/RemovedHandlerAssembly/RemovedHandlerAssembly.csproj`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/TestFixtures/RemovedHandlerAssembly/Handlers.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/TestFixtures/BreakingWorkflowAssembly/BreakingWorkflowAssembly.csproj`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/TestFixtures/BreakingWorkflowAssembly/Handlers.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/TestFixtures/UnsignedPluginAssembly/UnsignedPluginAssembly.csproj`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/TestFixtures/UnsignedPluginAssembly/Plugin.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/TestFixtures/FixtureDependency/FixtureDependency.csproj`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/TestFixtures/FixtureDependency/DependencyType.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/TestFixtures/MissingDependencyAssembly/MissingDependencyAssembly.csproj`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/TestFixtures/MissingDependencyAssembly/Plugin.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/TestFixtures/TestSigningKey.snk`
- Modify: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/PowerTools.API.PluginRegistration.Tests.csproj`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationEndpoints.cs`
- Modify: `api/PowerTools/PowerTools.API/Program.cs`

**Interfaces:**

- Adds: `POST /api/plugin-registration/assemblies/analyze` as multipart form data with one `assembly` file.
- Produces: identity, version, culture, public-key token, SHA-256, size, target/runtime diagnostics, detected `IPlugin` types, detected `CodeActivity` types, and workflow input/output contracts.
- Guarantees: no uploaded code is loaded or executed and no uploaded bytes survive the request.

- [ ] Create `net462` compiled Windows fixtures using `Microsoft.CrmSdk.CoreAssemblies` 9.0.2.59, `Microsoft.CrmSdk.Workflow` 9.0.2.59, and private build-only `Microsoft.NETFramework.ReferenceAssemblies` 1.0.3. Cover one and multiple plug-ins, one and multiple workflow activities, mixed handlers, input/output/reference-target/required workflow arguments, removed handlers, an unsigned assembly, a missing runtime dependency, and a breaking argument change. Include a type with a static constructor that writes a marker file if it runs; the fixed test signing key contains no production secret.
- [ ] Build the fixtures as test-project build dependencies and copy only their DLL outputs into `$(OutDir)Fixtures`. Keep symbols and fixture source in the test tree; do not check in arbitrary production DLLs.
- [ ] Write tests for the valid mixed fixture, stable class identities, workflow argument name/type/direction/requiredness, strong-name/public-key data, SHA-256, unsigned assembly rejection, corrupt PE rejection, oversized input rejection, and missing referenced dependency tolerance.
- [ ] In the static-initializer test, delete a test-local marker before inspection, inspect the fixture, then assert the marker does not exist. Run the inspector tests and verify they fail because no inspector exists.
- [ ] Implement the inspector only with `PEReader`, `MetadataReader`, metadata handles, signature decoding, and SHA-256 streaming:

```csharp
public interface IPluginAssemblyInspector
{
    Task<AssemblyInspectionDto> InspectAsync(
        Stream assembly,
        string fileName,
        long length,
        CancellationToken cancellationToken);
}

public sealed class PluginAssemblyInspector : IPluginAssemblyInspector
{
    public const long MaxAssemblyBytes = 16 * 1024 * 1024;
}
```

- [ ] Resolve `Microsoft.Xrm.Sdk.IPlugin`, `System.Activities.CodeActivity`, workflow attributes, base types, implemented interfaces, and property signatures by metadata full name. Never add `Assembly.Load`, `AssemblyLoadContext`, `Type.GetType`, `Activator`, reflection invocation, or dependency probing that loads code.
- [ ] Reject non-PE/non-managed files, empty files, files over the configured limit, missing assembly metadata, and unsigned inputs with safe validation codes. Report unsupported target/runtime constraints without executing the binary.
- [ ] Map the multipart analyze endpoint with request-size enforcement. Copy the upload only into a bounded request-local memory/temp stream, dispose it in the request, and return no server path. Do not log the file body or inspection exception details.
- [ ] Run inspector tests, the full focused xUnit project, and `dotnet test api/PowerTools/PowerTools.sln`.
- [ ] Commit the inspector and fixtures:

```powershell
git -c safe.directory=E:/dev/src/PowerTools add api/PowerTools/PowerTools.API/Tools/PluginRegistration api/PowerTools/PowerTools.API.PluginRegistration.Tests/AssemblyInspection api/PowerTools/PowerTools.API.PluginRegistration.Tests/TestFixtures api/PowerTools/PowerTools.API.PluginRegistration.Tests/PowerTools.API.PluginRegistration.Tests.csproj api/PowerTools/PowerTools.API/Program.cs
git -c safe.directory=E:/dev/src/PowerTools commit -m "feat: inspect plugin assemblies without loading code"
```

### Task 6: Implement the stateless signed preflight protocol and safe errors

**Files:**

- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/Dtos/MutationDtos.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationPlanSigner.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationPreflightService.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationProblem.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Preflight/PluginRegistrationPlanSignerTests.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Preflight/PluginRegistrationPreflightServiceTests.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Errors/PluginRegistrationProblemTests.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Support/ManualTimeProvider.cs`
- Modify: `api/PowerTools/PowerTools.API/Program.cs`

**Interfaces:**

- Produces: `MutationPlanDto`, `MutationChangeDto`, `MutationImpactDto`, `MutationWarningDto`, `MutationBlockerDto`, `ConfirmationRequirementDto`, and `MutationExecutionResultDto`.
- Produces: a short-lived stateless HMAC token binding environment, operation, target, normalized-request digest, server versions, DLL hash, capability flags, and expiry.
- Produces: structured sanitized problems with categories `validation`, `dependency`, `concurrency`, `permission`, `authentication`, `dataverse`, `communication`, `verification`, and `unsupported`.

- [ ] Write signer tests with a small test-only `ManualTimeProvider : TimeProvider` for round-trip validation, one-bit tampering, changed environment, changed target, changed normalized request, changed server version, changed DLL hash, expiry, and future-issued token rejection.
- [ ] Write preflight tests requiring stable normalization and deterministic digests: ordering-only differences in sets must not change the digest, while a changed step rank or image column must.
- [ ] Write error tests that feed tokens, secure strings, DLL-like bytes, stack traces, and Dataverse fault details into the mapper and assert none appear in serialized output. Run tests and verify they fail.
- [ ] Implement the binding and plan contracts:

```csharp
public sealed record MutationPlanBinding(
    string Environment,
    string Operation,
    Guid? TargetId,
    string RequestDigest,
    IReadOnlyDictionary<Guid, long> ServerVersions,
    string? AssemblySha256,
    IReadOnlyDictionary<string, bool> Capabilities,
    DateTimeOffset IssuedAt,
    DateTimeOffset ExpiresAt);

public sealed record PluginRegistrationProblemDto(
    string Category,
    string Code,
    string Message,
    string Environment,
    string? Component,
    string? CorrelationId,
    string SuggestedAction);
```

- [ ] Serialize the binding with stable property ordering, sign UTF-8 bytes using `HMACSHA256`, and encode payload/signature with base64url. Verify signatures using `CryptographicOperations.FixedTimeEquals`. Default plan lifetime is five minutes.
- [ ] Derive the signer key from the existing per-launch sidecar secret with an explicit plugin-registration purpose label; register the signer as a singleton and `TimeProvider.System` for production. Do not create a database, file, cache, history entry, or token registry.
- [ ] Implement `PluginRegistrationPreflightService.ValidateExecutionAsync` to re-read the target/dependencies, rebuild the binding, compare current versions/capabilities/digests/hash, and reject changed or expired plans before any gateway mutation method is called.
- [ ] Map known SDK/auth/HTTP/validation exceptions to safe status codes and problem categories. Preserve a Dataverse activity/correlation ID when available, but never return exception text wholesale.
- [ ] Run all preflight/error tests, then `dotnet test api/PowerTools/PowerTools.sln`.
- [ ] Commit the shared safety protocol:

```powershell
git -c safe.directory=E:/dev/src/PowerTools add api/PowerTools/PowerTools.API/Program.cs api/PowerTools/PowerTools.API/Tools/PluginRegistration/Dtos/MutationDtos.cs api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationPlanSigner.cs api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationPreflightService.cs api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationProblem.cs api/PowerTools/PowerTools.API.PluginRegistration.Tests/Preflight api/PowerTools/PowerTools.API.PluginRegistration.Tests/Errors api/PowerTools/PowerTools.API.PluginRegistration.Tests/Support/ManualTimeProvider.cs
git -c safe.directory=E:/dev/src/PowerTools commit -m "feat: protect plugin mutations with signed preflight"
```

### Task 7: Register and safely update assemblies end to end

**Files:**

- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/Dtos/AssemblyMutationDtos.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginAssemblyDiff.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginAssemblyMutationService.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Assemblies/PluginAssemblyDiffTests.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Assemblies/PluginAssemblyMutationTests.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/IPluginRegistrationGateway.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/DataversePluginRegistrationGateway.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationPreflightService.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationEndpoints.cs`
- Create: `desktop/src/ui/tools/plugin-registration/api/useAssemblyMutations.ts`
- Create: `desktop/src/ui/tools/plugin-registration/components/dialogs/AssemblyDialog.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/components/dialogs/ImpactPreviewDialog.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/tests/renderer/assemblyMutations.test.tsx`
- Modify: `desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx`

**Interfaces:**

- Adds: multipart `POST /api/plugin-registration/assemblies/register/preflight` and `/execute`.
- Adds: multipart `POST /api/plugin-registration/assemblies/{assemblyId}/update/preflight` and `/execute`.
- Requires: the same DLL bytes at analyze, preflight, and execute; the sidecar retains none and validates the plan-bound SHA-256 each time.
- Returns: verified assembly hierarchy plus a mutation outcome.

- [ ] Write assembly-diff tests for identity/version/hash changes, added/unchanged/removed ordinary plug-ins, added/changed/removed workflow activities, argument-contract changes, existing step/image ownership, workflows/actions, Custom APIs, managed state, and stale `versionnumber`.
- [ ] Require these blockers in tests: omitted plug-in with owned steps/images, removed plug-in with a Custom API/external dependency, removed referenced workflow activity, and a breaking referenced workflow contract. Verify removal of an unreferenced/childless type is allowed.
- [ ] Write gateway/service tests for register readback, update readback, verification mismatch, online fixed Sandbox/Database values, and an on-premises option rejected unless the capability binding allows it.
- [ ] Write renderer tests for file selection, analysis summary, exact before/after preview, warning/blocker display, no execute call while blocked, Cancel, Confirm, hash-bound second upload, verified success refresh, and no automatic retry. Run focused tests and verify failure.
- [ ] Add assembly draft contracts containing file name, inspection result, requested isolation/storage, expected assembly/type versions, and operation. Normalize them server-side; never trust renderer inspection fields in place of re-inspection.
- [ ] Build preflight output with old/new identity, version, culture, public-key token, SHA-256, size, added/removed/changed handlers, workflow contract differences, owned steps/images, dependencies, warnings, blockers, and the required confirmation level.
- [ ] Implement gateway register/update methods using Dataverse SDK entities/requests. At execute, validate the token and versions, re-inspect the supplied bytes, perform exactly one mutation attempt, then re-read assembly and generated handler records. Compare ID, identity, version, source hash where available, and handler types before returning `succeededAndVerified`.
- [ ] Implement `AssemblyDialog` as a draft form followed by `ImpactPreviewDialog`. Online displays Sandbox/Database as fixed values. Keep the `File` only in component memory, submit `FormData`, and clear it when the dialog closes.
- [ ] Use TanStack `useMutation({ retry: false })`. After verified success, update the selected record from the returned hierarchy, invalidate `['plugin-registration', 'catalog', connectionName]`, and then perform one complete catalog refresh.
- [ ] Run focused API and renderer tests, `dotnet test api/PowerTools/PowerTools.sln`, and `npm run check` from `desktop/`.
- [ ] Commit the assembly vertical slice:

```powershell
git -c safe.directory=E:/dev/src/PowerTools add api/PowerTools/PowerTools.API/Tools/PluginRegistration api/PowerTools/PowerTools.API.PluginRegistration.Tests/Assemblies desktop/src/ui/tools/plugin-registration/api/useAssemblyMutations.ts desktop/src/ui/tools/plugin-registration/components/dialogs/AssemblyDialog.tsx desktop/src/ui/tools/plugin-registration/components/dialogs/ImpactPreviewDialog.tsx desktop/src/ui/tools/plugin-registration/tests/renderer/assemblyMutations.test.tsx desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx
git -c safe.directory=E:/dev/src/PowerTools commit -m "feat: register and update plugin assemblies"
```

### Task 8: Create, update, enable, disable, and unregister plug-in steps

**Files:**

- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/Dtos/StepMutationDtos.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginStepValidator.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginStepMutationService.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Steps/PluginStepValidatorTests.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Steps/PluginStepMutationTests.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/IPluginRegistrationGateway.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/DataversePluginRegistrationGateway.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationEndpoints.cs`
- Create: `desktop/src/ui/tools/plugin-registration/api/useStepMutations.ts`
- Create: `desktop/src/ui/tools/plugin-registration/components/dialogs/StepDialog.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/components/dialogs/TypedNameConfirmationDialog.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/tests/renderer/stepMutations.test.tsx`
- Modify: `desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx`

**Interfaces:**

- Adds: `GET /api/plugin-registration/step-options` for supported message/filter/user choices on the selected connection.
- Adds: preflight/execute routes for step create, update, state change, and unregister.
- Step draft: plug-in ID, message/filter IDs, primary and secondary table, stage, mode, rank, filtering attributes, impersonating user, unsecure configuration, optional replacement secure configuration, and expected versions.

- [ ] Write validator theory tests for supported message/table filters, PreValidation/PreOperation/PostOperation, synchronous/asynchronous combinations, rank bounds, duplicate registrations, config length, impersonation validity, managed/non-customizable state, and stale versions.
- [ ] Add explicit tests proving asynchronous is accepted only for a valid PostOperation registration, an Update primary-key filtering attribute is rejected, and Update without filtering attributes produces a strong warning rather than silent acceptance.
- [ ] Write mutation tests for create/update/state/delete preflight binding, readback verification, dependency blockers, and exact typed-name confirmation metadata. Stored secure configuration must appear only as `secureConfigExists: true`; no fake or gateway response may contain its value.
- [ ] Write renderer tests that open the step modal from plug-in double-click/context menu, constrain options from `step-options`, show filtering warnings, reject primary-key selection, hide the stored secure value, accept an optional replacement, preview all changes, type a step name before delete, and show the full environment/message/table/stage in enable/disable confirmation.
- [ ] Run focused API/renderer tests and observe failures. Implement the validator as a pure service returning normalized values, warnings, and blockers before plan signing:

```csharp
public sealed record StepDraftDto(
    Guid PluginTypeId,
    Guid SdkMessageId,
    Guid SdkMessageFilterId,
    int Stage,
    int Mode,
    int Rank,
    IReadOnlyList<string> FilteringAttributes,
    Guid? ImpersonatingUserId,
    string? UnsecureConfiguration,
    string? ReplacementSecureConfiguration,
    IReadOnlyDictionary<Guid, long> ExpectedVersions);
```

- [ ] Implement connection-specific step options from Dataverse messages, message filters, table metadata, and enabled system users. Do not cache options across connection keys.
- [ ] At preflight, re-read the plug-in, duplicate candidates, message/filter metadata, target table primary ID, current step/config records, dependencies, and versions. Return the normalized before/after plan and a signed token.
- [ ] At execute, revalidate, perform one SDK create/update/state/delete attempt, then retrieve the step and secure-config existence flag. For unregister, require absence and return a verified result.
- [ ] Connect double-click/context-menu intents to `StepDialog` and `TypedNameConfirmationDialog`. Keep the right details pane read-only. Disable confirmation while blockers exist or the typed step name differs exactly.
- [ ] Run focused tests, `dotnet test api/PowerTools/PowerTools.sln`, and `npm run check`.
- [ ] Commit the complete step slice:

```powershell
git -c safe.directory=E:/dev/src/PowerTools add api/PowerTools/PowerTools.API/Tools/PluginRegistration api/PowerTools/PowerTools.API.PluginRegistration.Tests/Steps desktop/src/ui/tools/plugin-registration/api/useStepMutations.ts desktop/src/ui/tools/plugin-registration/components/dialogs/StepDialog.tsx desktop/src/ui/tools/plugin-registration/components/dialogs/TypedNameConfirmationDialog.tsx desktop/src/ui/tools/plugin-registration/tests/renderer/stepMutations.test.tsx desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx
git -c safe.directory=E:/dev/src/PowerTools commit -m "feat: manage plugin execution steps"
```

### Task 9: Create, update, and unregister step images

**Files:**

- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/Dtos/ImageMutationDtos.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginImageValidator.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginImageMutationService.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Images/PluginImageValidatorTests.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Images/PluginImageMutationTests.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/IPluginRegistrationGateway.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/DataversePluginRegistrationGateway.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationEndpoints.cs`
- Create: `desktop/src/ui/tools/plugin-registration/api/useImageMutations.ts`
- Create: `desktop/src/ui/tools/plugin-registration/components/dialogs/ImageDialog.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/tests/renderer/imageMutations.test.tsx`
- Modify: `desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx`

**Interfaces:**

- Adds: preflight/execute routes for image create, update, and unregister.
- Image draft: step ID, image type, alias, message-property name, selected column logical names, and expected versions.
- Reuses: exact-name confirmation for image unregister and the shared impact-preview dialog.

- [ ] Write validator tests for Create/Update/Delete message support, valid pre/post availability by stage, supported message-property name, non-empty unique alias, duplicate aliases, selected table attributes, managed/customizable state, and stale step/image versions.
- [ ] Add a hard-failure test for all-columns and a test requiring at least one explicitly selected column. Add tests that reject invalid pre-image/post-image combinations for the step's message and stage.
- [ ] Write mutation tests for create/update/delete preflight, token/version binding, SDK payload mapping, readback, and verified absence after unregister.
- [ ] Write renderer tests for opening from the step menu, message-aware image-type choices, explicit attribute selection, all-columns rejection, before/after preview, exact image-name confirmation, and catalog refresh after verified success. Run tests and verify the slice is absent.
- [ ] Implement the draft and validator:

```csharp
public sealed record ImageDraftDto(
    Guid StepId,
    int ImageType,
    string Alias,
    string MessagePropertyName,
    IReadOnlyList<string> Attributes,
    IReadOnlyDictionary<Guid, long> ExpectedVersions);
```

- [ ] Re-read the parent step, message/filter, table attributes, sibling aliases, managed/customizable flags, and versions during preflight. Normalize attributes case-insensitively and sort them before digesting/signing.
- [ ] Execute one SDK mutation only after plan revalidation. Retrieve the image and parent version after create/update; verify complete absence after delete.
- [ ] Connect `ImageDialog` to step context-menu and image double-click intents. Use the shared typed-name confirmation for unregister and retain read-only details.
- [ ] Run focused tests, `dotnet test api/PowerTools/PowerTools.sln`, and `npm run check`.
- [ ] Commit the image slice:

```powershell
git -c safe.directory=E:/dev/src/PowerTools add api/PowerTools/PowerTools.API/Tools/PluginRegistration api/PowerTools/PowerTools.API.PluginRegistration.Tests/Images desktop/src/ui/tools/plugin-registration/api/useImageMutations.ts desktop/src/ui/tools/plugin-registration/components/dialogs/ImageDialog.tsx desktop/src/ui/tools/plugin-registration/tests/renderer/imageMutations.test.tsx desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx
git -c safe.directory=E:/dev/src/PowerTools commit -m "feat: manage plugin step images"
```

### Task 10: Show workflow contracts/dependencies and update workflow-activity metadata

**Files:**

- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/Dtos/WorkflowActivityMutationDtos.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/WorkflowContractComparer.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/WorkflowActivityMutationService.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/WorkflowActivities/WorkflowContractComparerTests.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/WorkflowActivities/WorkflowActivityMutationTests.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/IPluginRegistrationGateway.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/DataversePluginRegistrationGateway.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationCatalogService.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationEndpoints.cs`
- Create: `desktop/src/ui/tools/plugin-registration/api/useWorkflowActivityMutations.ts`
- Create: `desktop/src/ui/tools/plugin-registration/components/dialogs/WorkflowActivityDialog.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/tests/renderer/workflowActivity.test.tsx`
- Modify: `desktop/src/ui/tools/plugin-registration/components/RegistrationDetails.tsx`
- Modify: `desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx`

**Interfaces:**

- Catalog/details include read-only workflow input/output contracts and dependent workflows/actions.
- Adds: `POST /api/plugin-registration/workflow-activities/{id}/update/preflight` and `/execute`.
- Editable fields: name, friendly name, workflow activity group name, and description only.

- [ ] Write contract-comparer tests for compatible additions, removed arguments, type changes, direction changes, class-identity changes, and a newly required argument. Assert referenced breaking changes are blockers and unreferenced breaking changes are clearly warned.
- [ ] Write mutation tests for supported metadata fields, managed/non-customizable blockers, stale version, dependent process readback, token validation, and verified update. Assert no workflow-definition write request is ever constructed.
- [ ] Write renderer tests that show `(Workflow Activity)` directly below the assembly, display arguments and dependent workflows/actions read-only, open the metadata dialog on double-click/right-click, expose only the four supported fields, preview changes, and keep workflow definitions uneditable.
- [ ] Run focused tests and verify failure. Implement dependency retrieval using Dataverse dependency APIs and process records, mapping only safe process ID/name/category/state details into the catalog.
- [ ] Implement the supported draft contract:

```csharp
public sealed record WorkflowActivityDraftDto(
    Guid WorkflowActivityId,
    string Name,
    string? FriendlyName,
    string? WorkflowActivityGroupName,
    string? Description,
    IReadOnlyDictionary<Guid, long> ExpectedVersions);
```

- [ ] Re-read activity/dependencies/version at preflight and execute. Update only the supported `plugintype` registration properties, then verify them by readback. Do not add any endpoint or gateway method for editing workflow/process definitions.
- [ ] Update `RegistrationDetails` with separate Properties, Argument Contract, and Dependent Workflows/Actions sections. Connect the modal intent while preserving the no-edit-buttons details rule.
- [ ] Run focused tests, `dotnet test api/PowerTools/PowerTools.sln`, and `npm run check`.
- [ ] Commit the workflow-activity slice:

```powershell
git -c safe.directory=E:/dev/src/PowerTools add api/PowerTools/PowerTools.API/Tools/PluginRegistration api/PowerTools/PowerTools.API.PluginRegistration.Tests/WorkflowActivities desktop/src/ui/tools/plugin-registration/api/useWorkflowActivityMutations.ts desktop/src/ui/tools/plugin-registration/components/dialogs/WorkflowActivityDialog.tsx desktop/src/ui/tools/plugin-registration/tests/renderer/workflowActivity.test.tsx desktop/src/ui/tools/plugin-registration/components/RegistrationDetails.tsx desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx
git -c safe.directory=E:/dev/src/PowerTools commit -m "feat: manage workflow activity registration metadata"
```

### Task 11: Add dependency-safe transactional cascade unregister

**Files:**

- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/Dtos/UnregisterDtos.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationDependencyService.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationCapabilityService.cs`
- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationCascadeService.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Cascade/PluginRegistrationDependencyServiceTests.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Cascade/PluginRegistrationCascadeServiceTests.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Cascade/PluginRegistrationCapabilityServiceTests.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/IPluginRegistrationGateway.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/DataversePluginRegistrationGateway.cs`
- Modify: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationEndpoints.cs`
- Create: `desktop/src/ui/tools/plugin-registration/api/useUnregisterMutations.ts`
- Create: `desktop/src/ui/tools/plugin-registration/components/dialogs/CascadeConfirmationDialog.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/tests/renderer/cascadeUnregister.test.tsx`
- Modify: `desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx`

**Interfaces:**

- Adds: `GET /api/plugin-registration/capabilities` with `transactionalCascadeUnregister.supported` and a safe reason.
- Adds: preflight/execute unregister routes for an assembly and a plug-in/workflow-activity type.
- Plug-in order: images, steps, selected plug-in type. Assembly order: images, steps, plug-in/workflow-activity types, assembly.
- Guarantees: one `ExecuteTransactionRequest` or no delete; never sequential partial deletion.

- [ ] Write dependency tests with owned descendants plus workflows/actions, Custom APIs, managed solution components, non-customizable records, and unrelated external solution components. Assert only owned images/steps/selected types enter the cascade and every external component becomes a blocker.
- [ ] Write cascade-plan tests for exact IDs, child-before-parent ordering, exact counts, enabled-step visibility, solution association display, version bindings, duplicate elimination, and deterministic transaction construction.
- [ ] Write capability tests proving the execute endpoint is unavailable when transaction support has not been release-approved or the connected environment reports an unsupported request. Assert there is no sequential gateway method available as fallback.
- [ ] Write renderer tests for type-specific menu actions, unsupported-capability explanation, complete impact lists, full class-name confirmation for plug-in/workflow activity, assembly acknowledgment checkbox plus exact assembly name, blocker display, count-bearing destructive button text, and verified tree removal.
- [ ] Run focused tests and observe failures. Implement the explicit impact contract:

```csharp
public sealed record CascadeImpactDto(
    PluginAssemblyDto? Assembly,
    IReadOnlyList<PluginHandlerDto> Handlers,
    IReadOnlyList<PluginStepDto> Steps,
    IReadOnlyList<PluginImageDto> Images,
    IReadOnlyList<ComponentDependencyDto> ExternalDependencies,
    int EnabledStepCount);
```

- [ ] Query dependencies with Dataverse dependency APIs and targeted process/Custom API relationships. Classify ownership from the selected registration hierarchy; never infer external ownership from matching names.
- [ ] Construct one transaction in child-before-parent order:

```csharp
var transaction = new ExecuteTransactionRequest
{
    Requests = new OrganizationRequestCollection(deleteRequests),
    ReturnResponses = true
};
```

- [ ] Bind the exact ordered IDs, versions, dependency snapshot, and approved capability into the preflight token. At execute, re-read and compare them immediately before calling the transaction once.
- [ ] After a successful transaction, query every planned ID and require all owned records to be absent. If readback finds any planned record, return `verification` failure rather than success.
- [ ] Implement `CascadeConfirmationDialog` so plug-in/workflow activity requires the full class name, assembly requires both an acknowledgment and exact assembly name, and the destructive label includes exact handler/step/image counts. External blockers keep the action disabled.
- [ ] Run focused tests, `dotnet test api/PowerTools/PowerTools.sln`, and `npm run check`. Leave release capability disabled until Task 13's disposable-environment proof passes.
- [ ] Commit the cascade implementation behind the capability gate:

```powershell
git -c safe.directory=E:/dev/src/PowerTools add api/PowerTools/PowerTools.API/Tools/PluginRegistration api/PowerTools/PowerTools.API.PluginRegistration.Tests/Cascade desktop/src/ui/tools/plugin-registration/api/useUnregisterMutations.ts desktop/src/ui/tools/plugin-registration/components/dialogs/CascadeConfirmationDialog.tsx desktop/src/ui/tools/plugin-registration/tests/renderer/cascadeUnregister.test.tsx desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx
git -c safe.directory=E:/dev/src/PowerTools commit -m "feat: add gated transactional plugin unregister"
```

### Task 12: Reconcile uncertain writes and present actionable outcomes

**Files:**

- Create: `api/PowerTools/PowerTools.API/Tools/PluginRegistration/VerifiedMutationExecutor.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Mutations/VerifiedMutationExecutorTests.cs`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Mutations/MutationReconciliationTests.cs`
- Modify: assembly, step, image, workflow-activity, and cascade services under `api/PowerTools/PowerTools.API/Tools/PluginRegistration/`
- Create: `desktop/src/ui/tools/plugin-registration/model/pluginRegistrationError.ts`
- Create: `desktop/src/ui/tools/plugin-registration/components/MutationOutcomeBanner.tsx`
- Create: `desktop/src/ui/tools/plugin-registration/tests/node/pluginRegistrationError.test.ts`
- Create: `desktop/src/ui/tools/plugin-registration/tests/renderer/mutationOutcomes.test.tsx`
- Modify: `desktop/src/ui/tools/plugin-registration/components/dialogs/ImpactPreviewDialog.tsx`
- Modify: `desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx`

**Interfaces:**

- Mutation outcomes: `succeededAndVerified`, `rejectedBeforeCompletion`, `reconciledAfterCommunicationFailure`, and `outcomeUncertain`.
- Assembly reconciliation compares server ID, version, source hash, and handler types.
- Delete reconciliation checks target and all owned descendants; other updates compare normalized requested fields and current versions.
- Guarantees: execute delegate is invoked at most once.

- [ ] Write executor tests for validation failure before send, ordinary success/readback, timeout before a send can start, timeout after a send may have completed, reconciliation proving success, reconciliation proving rejection, contradictory readback, and a second-call counter that must remain zero.
- [ ] Write operation-specific reconciliation tests for assembly register/update, step state/update, image update/delete, workflow metadata update, and cascade absence.
- [ ] Write renderer parsing tests for every structured category and outcome. Write UI tests that distinguish verified success, reconciled success, retryable read-only failure, stale-plan refresh, and uncertain outcome with `Refresh and inspect before trying again` guidance.
- [ ] Run focused tests and observe failure. Implement a single-attempt executor:

```csharp
public interface IVerifiedMutationExecutor
{
    Task<MutationExecutionResultDto> ExecuteAsync(
        Func<CancellationToken, Task> mutateOnce,
        Func<CancellationToken, Task<MutationReconciliationResult>> reconcile,
        Func<CancellationToken, Task<bool>> verify,
        CancellationToken cancellationToken);
}
```

- [ ] Track whether control reached the SDK mutation call. Catch only classified communication failures for reconciliation; propagate validation, dependency, concurrency, permission, authentication, and deterministic Dataverse faults as `rejectedBeforeCompletion`.
- [ ] For possible lost responses, perform read-only reconciliation and verification. Never call `mutateOnce` again. Return uncertainty when evidence is insufficient or contradictory.
- [ ] Route every mutation service through the executor and remove direct success returns. Add tests asserting each success response follows a Dataverse readback.
- [ ] Parse structured problems in the renderer without exposing raw Axios error bodies. Keep mutation hooks at `retry: false`; only catalog/options reads may use safe read retry behavior.
- [ ] Show outcomes in a reusable banner/toast. For uncertainty, keep the dialog closed, refresh the complete catalog once, select the affected component if found, and disable any immediate repeat action until the refresh finishes.
- [ ] Run focused tests, `dotnet test api/PowerTools/PowerTools.sln`, and `npm run check`.
- [ ] Commit reconciliation/error UX:

```powershell
git -c safe.directory=E:/dev/src/PowerTools add api/PowerTools/PowerTools.API/Tools/PluginRegistration api/PowerTools/PowerTools.API.PluginRegistration.Tests/Mutations desktop/src/ui/tools/plugin-registration/model/pluginRegistrationError.ts desktop/src/ui/tools/plugin-registration/components/MutationOutcomeBanner.tsx desktop/src/ui/tools/plugin-registration/components/dialogs/ImpactPreviewDialog.tsx desktop/src/ui/tools/plugin-registration/tests/node/pluginRegistrationError.test.ts desktop/src/ui/tools/plugin-registration/tests/renderer/mutationOutcomes.test.tsx desktop/src/ui/tools/plugin-registration/PluginRegistration.tsx
git -c safe.directory=E:/dev/src/PowerTools commit -m "feat: reconcile and verify plugin mutations"
```

### Task 13: Complete Electron, packaging, performance, and release-safety gates

**Files:**

- Create: `desktop/test/smoke/pluginRegistration.spec.ts`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.Tests/Performance/LargeCatalogTests.cs`
- Create: `desktop/src/ui/tools/plugin-registration/tests/renderer/largeCatalog.test.tsx`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.LiveTests/PowerTools.API.PluginRegistration.LiveTests.csproj`
- Create: `api/PowerTools/PowerTools.API.PluginRegistration.LiveTests/TransactionalCascadeSmokeTests.cs`
- Create: `desktop/docs/qa/plugin-registration-release-checklist.md`
- Modify: `api/PowerTools/PowerTools.sln`
- Modify only if the disposable smoke passes: the release-controlled cascade capability default/configuration in `api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationCapabilityService.cs`

**Interfaces:**

- Extends: credential-free Electron smoke to open Plugin Registration, load an intercepted fake catalog, search, select/expand, open a context menu, and open a modal.
- Adds: opt-in live tests requiring an explicitly named disposable non-production connection and signed fixture assembly.
- Establishes: measurable full-load/search thresholds and the release evidence needed to enable transactional cascade.

- [ ] Add a synthetic catalog test with at least 100 assemblies, 1,000 handlers, 10,000 steps, and 20,000 images. Assert hierarchy construction and representative searches complete within an agreed Windows CI threshold and do not change full retrieval into node-lazy loading. If the renderer threshold fails, virtualize rendered rows while retaining the complete in-memory DTO.
- [ ] Add an Electron smoke that uses an isolated `--user-data-dir`, a fake non-secret connection in that isolated profile, and Playwright network interception for catalog/options/preflight responses. It must exercise the real packaged preload and shared API client without adding registration-specific IPC or touching persisted user credentials.
- [ ] Assert smoke behavior: open via tooltip `Browse and safely manage Dataverse plug-in registrations`, select the fake connection, load the direct hierarchy, search a nested image, single-click expansion/selection, right-click menu, double-click modal, and read-only details.
- [ ] Create a `LiveFactAttribute : FactAttribute` in the live test project that sets `Skip` unless all three variables are present: `POWERTOOLS_PLUGIN_LIVE=1`, `POWERTOOLS_PLUGIN_CONNECTION=<explicit disposable connection>`, and `POWERTOOLS_PLUGIN_FIXTURE=<absolute signed fixture path>`. When enabled, fail fast if the environment does not identify itself as disposable/development.
- [ ] Implement the live scenario in order: register fixture, create step, create image, update safely, verify a referenced breaking workflow contract is blocked, execute one transactional cascade, and verify every owned ID is absent. Add a separate external-dependency case proving deletion is blocked and the external component remains.
- [ ] Run the credential-free gates:

```powershell
dotnet test api/PowerTools/PowerTools.sln
dotnet publish api/PowerTools/PowerTools.API -c Release -r win-x64
Set-Location desktop
npm test -- src/ui/tools/plugin-registration
npm run check
```

- [ ] Run the opt-in live test only against the approved disposable environment. Record environment name, Dataverse version, transaction request outcome, rollback proof from an intentionally failing child delete, cascade verification, and external-blocker proof in `desktop/docs/qa/plugin-registration-release-checklist.md`; never record credentials or DLL bytes.

```powershell
dotnet test api/PowerTools/PowerTools.API.PluginRegistration.LiveTests/PowerTools.API.PluginRegistration.LiveTests.csproj -c Release
```
- [ ] Enable the release-controlled cascade capability only if the atomic rollback and successful cascade proofs both pass. If either proof fails, leave capability disabled and document `Cascade unregister unsupported; no sequential fallback` as the release behavior.
- [ ] Review the final diff for: no assembly content in catalog queries, no secure value display, no mutation retry, no DLL persistence/load, no raw Electron access, no workflow-definition writes, no external dependency deletes, and no action-history/rollback code.
- [ ] Commit final gates and, only with proof, the capability enablement:

```powershell
git -c safe.directory=E:/dev/src/PowerTools add desktop/test/smoke/pluginRegistration.spec.ts desktop/src/ui/tools/plugin-registration/tests/renderer/largeCatalog.test.tsx api/PowerTools/PowerTools.API.PluginRegistration.Tests/Performance api/PowerTools/PowerTools.API.PluginRegistration.LiveTests api/PowerTools/PowerTools.sln desktop/docs/qa/plugin-registration-release-checklist.md api/PowerTools/PowerTools.API/Tools/PluginRegistration/PluginRegistrationCapabilityService.cs
git -c safe.directory=E:/dev/src/PowerTools commit -m "test: gate plugin registration release"
```

## Final Acceptance Checklist

- [ ] A selected connection loads one complete catalog and switching connections cannot display stale environment data.
- [ ] The hierarchy is Assembly → direct `(Plugin)`/`(Workflow Activity)` → `(Step)` → `(Image)`, with local search across every level.
- [ ] The header, two-thirds/one-third resizable workspace, read-only details, single-click, double-click, right-click, and modal behaviors match the approved design.
- [ ] Assembly inspection proves static initialization is not executed and no request persists DLL bytes.
- [ ] Register/update operations show exact identity, version, hash, handler, step/image, contract, and dependency impact.
- [ ] Step/image/workflow-activity validators enforce the approved Dataverse rules and secure configuration is never disclosed.
- [ ] Every mutation has a signed, short-lived, environment/version/hash-bound preflight and a verified readback.
- [ ] Exact-name and count-bearing confirmations are required for destructive operations.
- [ ] External dependencies block unregister and remain untouched.
- [ ] Cascade is one proven Dataverse transaction or is reported unsupported; no sequential fallback exists.
- [ ] Lost responses reconcile read-only, mutation execute calls are never retried, and uncertainty tells the user to refresh and inspect.
- [ ] `dotnet test`, Windows sidecar publish, focused Plugin Registration tests, full `npm run check`, Electron smoke, and the release checklist have recorded outcomes.
