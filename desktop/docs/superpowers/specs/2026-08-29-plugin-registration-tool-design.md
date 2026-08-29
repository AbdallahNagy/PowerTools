# Plugin Registration Tool Design

**Date:** 2026-08-29

## Objective

Add a built-in PowerTools module for safely browsing and managing Microsoft Dataverse plug-in registrations through the existing desktop and ASP.NET Core sidecar architecture.

The tool manages plug-in assemblies, plug-in classes, message-processing steps, entity images, and custom workflow activities. It emphasizes complete impact previews, explicit confirmation, dependency protection, concurrency checks, and verification of every mutation.

## Scope

Included:

- Load and search the complete registration catalog for one selected connection.
- Register and update signed plug-in assemblies.
- Inspect assembly identity, version, hash, plug-in classes, and custom workflow activities without executing uploaded code.
- Browse and manage plug-in classes, steps, and entity images.
- Browse and manage custom workflow activity registration metadata.
- Enable and disable plug-in steps.
- Cascade-unregister assemblies and plug-in classes after an exact dependency preflight.
- Detect dependent workflows, Custom APIs, managed components, and other external blockers.
- Show a before-and-after preview before every mutation.
- Revalidate immediately before mutation and verify the resulting Dataverse state.
- Support the existing online and on-premises connection paths through the sidecar.
- Add credential-free sidecar, renderer, and Electron tests.

Excluded from the first release:

- Plug-in Profiler, replay, and debugging.
- Creating or editing workflow definitions.
- Creating or editing Custom APIs.
- Webhooks, Azure Service Bus/service endpoints, and virtual table data providers.
- Plug-in package or NuGet dependency deployment.
- Bulk operations outside one explicitly selected registration hierarchy.
- A global inspect/edit mode.
- Rollback, restore points, or automatic reversal of business-data side effects.
- Action history, saved change snapshots, or stored previous DLLs.
- Automatic deletion of workflows, Custom APIs, or other external solution components.

## Terminology and Hierarchy

Dataverse stores both ordinary plug-ins and custom workflow activities in `PluginType` records. PowerTools uses familiar user-facing labels and reserves `PluginType` for internal contracts.

```text
Assembly                       PluginAssembly
├── (Plugin) class             PluginType implementing IPlugin
│   └── (Step) registration    SdkMessageProcessingStep
│       └── (Image) snapshot   SdkMessageProcessingStepImage
└── (Workflow Activity) class  PluginType deriving CodeActivity
```

An ordinary plug-in class runs because one or more steps bind it to a Dataverse message, table, stage, and execution mode. A custom workflow activity has no message-processing step; a workflow or action invokes it intentionally.

## Architecture

### Renderer tool module

The feature remains private to one built-in module:

```text
desktop/src/ui/tools/plugin-registration/
├── api/             typed hooks and HTTP calls
├── components/      hierarchy, details, dialogs, forms, menus
├── model/           renderer contracts, filtering, presentation rules
├── tests/           node and renderer tests
├── PluginRegistration.tsx
├── tool.ts
└── plugin-registration-icon.svg
```

The module uses public shared connection, API, status, and UI capabilities. It does not access raw Electron APIs, tokens, shell internals, or another tool's private files.

The existing uncommitted Plugin Registration shell is preserved and incrementally extended.

### Sidecar feature

The ASP.NET Core sidecar owns Dataverse registration behavior:

```text
api/PowerTools/PowerTools.API/Tools/PluginRegistration/
├── PluginRegistrationEndpoints.cs
├── PluginRegistrationService.cs
├── PluginAssemblyInspector.cs
├── PluginRegistrationValidator.cs
└── Dtos/
```

Responsibilities:

- Query registration and dependency records.
- Inspect uploaded assemblies using metadata-only APIs.
- Calculate preflight plans and impact summaries.
- Validate assembly, step, image, and workflow-activity rules.
- Protect mutations with server-version and signed-plan checks.
- Execute Dataverse SDK requests.
- Re-read affected records and verify outcomes.
- Reconcile uncertain results after network or timeout failures.
- Return sanitized structured errors.

### Existing connection boundary

All registration operations use the current sidecar connection infrastructure:

```text
React tool
    ↓
shared authenticated API client
    ↓
DataverseContextFilter
    ↓
DataverseClientFactory
    ↓
IOrganizationServiceAsync2
```

Electron main and preload receive no new registration IPC. A standard renderer file input selects a DLL and sends its bytes to the local sidecar for one analysis or mutation request.

## Assembly Inspection Security

- Treat every selected DLL as untrusted input.
- Use metadata-only inspection; never load or execute the assembly in the sidecar process.
- Extract assembly identity, version, culture, public key token, class identities, implemented base contracts, and workflow input/output metadata.
- Validate file format, signing requirements, supported target/runtime constraints, and size before registration.
- Calculate SHA-256 for display and plan binding.
- Do not persist uploaded bytes after the request.
- Do not log DLL content, tokens, secure configuration, or raw sensitive payloads.
- Online Dataverse uses Sandbox isolation and Database storage. Unsupported online alternatives are not shown.
- On-premises options are limited to capabilities reported by the connected environment.

## Catalog Model and Loading

Selecting a connection triggers one complete catalog load. The sidecar retrieves assemblies, types, steps, and images with four focused, pageable queries and assembles one hierarchy DTO.

The catalog excludes:

- Assembly `Content` bytes.
- Stored secure-configuration values.
- Unneeded large or sensitive columns.

The catalog includes IDs, names, descriptions, handler classification, hierarchy links, enabled state, managed/customizable state, solution information where available, and `versionnumber` values for concurrency checks.

All records load before the catalog is considered ready. PowerTools does not display an incomplete hierarchy as complete. Switching connections cancels obsolete reads, clears the prior catalog, and uses a connection-specific query-cache key.

Search runs locally across assembly, plug-in, workflow activity, step, image, message, and table labels. Tree virtualization may be added if large synthetic catalogs demonstrate a renderer performance problem; data retrieval remains complete rather than node-lazy.

After a mutation, the UI applies the verified returned record and refreshes the complete catalog. A manual refresh icon remains available.

## User Interface

The tool has three structural regions.

### Header

- Connection selector on the left.
- Refresh icon beside the connection selector.
- `Register assembly` primary button on the right.
- Space for future primary actions without changing the layout contract.

### Main hierarchy pane

- Defaults to two-thirds of the main width.
- Resizable with the same `react-resizable-panels` pattern as Data Migration.
- Search input above the complete registration hierarchy.
- Direct hierarchy without an intermediate `Plug-ins` group:

```text
Assembly
├── (Plugin) ValidateAccount
│   ├── (Step) Update account · PreOperation
│   │   └── (Image) PreImage
│   └── (Step) Create account · PreValidation
└── (Workflow Activity) CalculateDiscount
```

- Convenient, differentiated typography for assemblies, handlers, steps, and images.
- PowerTools colors, selection state, borders, spacing, and focus behavior.
- Single click selects a node and toggles its immediate hierarchy expansion.
- Double click opens the appropriate register/update modal.
- Right click opens a styled, type-specific context menu.

Context menus:

- Assembly: update assembly, unregister assembly.
- Plug-in: register new step, unregister plug-in.
- Step: update step, register new image, enable/disable, unregister step.
- Image: update image, unregister image.
- Workflow activity: update registration properties, unregister workflow activity.

### Details pane

- Defaults to one-third of the main width.
- Read-only; it contains no edit or unregister buttons.
- Displays properties and dependencies for the selected component.
- Updates immediately when the selection changes.

All mutation forms open as focused modal dialogs. The form leads to a separate impact preview and confirmation before the sidecar receives a mutation request.

## Preflight Protocol

Every mutation follows the same protocol:

```text
Draft requested change
    ↓
sidecar reads current Dataverse state
    ↓
preflight plan with changes, impact, warnings, and blockers
    ↓
user confirmation
    ↓
sidecar revalidates current state and plan
    ↓
mutation
    ↓
server readback and verification
```

A preflight plan contains:

- Environment and selected component.
- Operation and normalized requested values.
- Current component `versionnumber` values.
- Before-and-after values.
- Owned descendants affected by a cascade.
- External dependencies and blockers.
- Warnings and required confirmation level.
- DLL hash for assembly operations.
- A short-lived signed plan token.

The token binds the environment, component, request digest, server versions, DLL hash, and expiry. The sidecar recomputes these values at execution. A changed, expired, or tampered plan requires a new preview and confirmation. The token is transient and is not an action-history record.

## Confirmation Rules

Confirmations describe the actual effect; they never use a generic `Are you sure?` message.

- Ordinary edits show every changed property and use explicit Confirm/Cancel actions.
- Enable/disable identifies the environment, step, message, table, stage, and whether execution is starting or stopping.
- Assembly updates show identity, version, hash, added/removed/changed handlers, and affected steps/workflows.
- Step deletion requires typing the step name.
- Plug-in and workflow-activity deletion requires typing the full class name.
- Assembly cascade deletion requires an acknowledgment plus the exact assembly name.
- Destructive buttons state the counts, such as `Delete assembly, 4 handlers, 12 steps, and 7 images`.

## Registration and Update Workflows

### Register assembly

Preflight shows file identity, version, culture, public key token, SHA-256, size, detected plug-ins, detected workflow activities and argument contracts, conflicts with existing identities, and valid isolation/storage settings.

After confirmation, the sidecar registers the assembly, retrieves generated handler records, and returns the verified hierarchy.

### Update assembly

Preflight compares:

- Old and new identity, version, and hash.
- Added, removed, and unchanged plug-in classes.
- Added, removed, and changed workflow activities.
- Existing steps and images per plug-in.
- Workflow argument contract changes.
- Referencing workflows, actions, and Custom APIs.
- Managed/customizable state and concurrent modifications.

Removing an ordinary plug-in class during assembly update is allowed only when that class has no steps, images, Custom APIs, or other external dependents. An update that omits a class with owned steps/images is blocked rather than treating the assembly update as implicit deletion. The user first invokes the plug-in's explicit cascade-unregister action, confirms its complete impact, and then retries the assembly update. External dependencies remain blockers.

For custom workflow activities:

- Removal is allowed when no workflow/action references the activity.
- Removal is blocked while external process dependencies exist.
- Removing arguments, changing argument types/directions, changing class identity, or adding a required argument is a breaking contract change.
- A breaking in-place update is blocked when existing processes reference the activity.
- PowerTools instructs the user to register a new major/minor assembly version, migrate the processes, and unregister the old version.

### Step management

Step validation covers message/table compatibility, stage, execution mode, filtering attributes, execution order, impersonating user, configuration limits, duplicate registrations, managed/customizable state, and current server version.

Online asynchronous execution is available only for valid PostOperation registrations. Update steps strongly require filtering attributes. Including the primary key as a filtering attribute is rejected because it defeats useful filtering.

Stored secure configuration is never displayed. A form may accept a replacement secure value, but readback reports only whether secure configuration exists.

### Image management

Validation covers message support, pre/post availability by operation and stage, alias, message-property name, selected columns, duplicate aliases, and managed/customizable state.

Selecting all columns is rejected. Users select only columns required by the plug-in logic.

### Custom workflow activity metadata

PowerTools displays and allows updating supported registration metadata:

- Name.
- Friendly name.
- Workflow activity group name.
- Description.
- Read-only input/output argument contracts.
- Read-only dependent workflows/actions.

It does not edit workflow definitions or activity code.

## Cascade Unregister

Cascade deletion removes the registration hierarchy owned by the selected target.

Plug-in cascade:

```text
Images → Steps → selected plug-in type
```

Assembly cascade:

```text
Images → Steps → plug-in/workflow-activity types → assembly
```

The preflight lists every affected assembly, handler, step, image, enabled state, solution association, and exact count. It also calls Dataverse dependency APIs.

Owned descendants may be deleted. External components are never silently deleted. Examples of blockers include:

- Workflows or actions referencing a custom workflow activity.
- Custom APIs referencing a plug-in type.
- Managed solution dependencies.
- Non-customizable components.
- Other solution components outside the registration hierarchy.

The preferred execution is one Dataverse transaction so all owned registration deletes succeed or none do. Transaction support for these component types must be proven in an isolated non-production environment before cascade unregister is enabled for release.

If the connected environment cannot perform the required transaction safely, PowerTools reports cascade unregister as unsupported. It does not silently fall back to sequential partial deletion.

After success, PowerTools verifies that the selected target and all owned descendants no longer exist.

## Concurrency and Error Handling

Mutations require matching server versions. If another administrator changes a component after it was loaded or previewed, PowerTools rejects the stale operation and requires refresh and reconfirmation.

Structured error categories:

- Validation error.
- Dependency blocker.
- Concurrency conflict.
- Permission or authentication error.
- Dataverse fault.
- Communication failure.
- Verification mismatch.
- Unsupported capability.

Errors contain a safe code, useful message, environment, component, correlation/activity ID when available, and a suggested next action. They exclude tokens, secure values, DLL bytes, stack traces, and sensitive payloads.

Read requests may retry safely. Mutation requests never retry automatically.

If a mutation response is lost or times out, the sidecar queries the affected records and reports one of:

- Succeeded and verified.
- Rejected before completion.
- Outcome reconciled after communication failure.
- Outcome uncertain; refresh and inspect before trying again.

Assembly reconciliation compares server ID, version, source hash, and handler types. Delete reconciliation checks the target and owned descendants. PowerTools never invites a blind second mutation while the outcome is uncertain.

## Testing Strategy

### Assembly fixtures and inspector tests

Use compiled fixtures for one and multiple `IPlugin` classes, one and multiple `CodeActivity` classes, mixed assemblies, workflow arguments, added/removed handlers, breaking argument changes, unsigned assemblies, invalid files, oversized assemblies, and missing dependencies.

Include a fixture with static initialization and prove metadata inspection never executes it.

### Sidecar tests

Add a normal automated .NET test project using xUnit and a narrow fakeable Dataverse registration gateway. Cover:

- Full catalog retrieval, paging, hierarchy, and classification.
- Exclusion of assembly content and secure configuration.
- Step and image validation rules.
- Managed/customizable and dependency blockers.
- Workflow contract comparisons.
- Exact cascade impact and transaction construction.
- Exclusion of external dependencies from cascade requests.
- Signed-plan expiry and tamper rejection.
- Stale-version rejection.
- Sanitized errors and uncertain-result reconciliation.
- Verification after each mutation.

### Renderer tests

Use Vitest, Testing Library, `user-event`, and MSW to cover:

- Complete catalog loading and connection isolation.
- Search across every hierarchy level.
- Single-click selection and expansion.
- Double-click modal behavior.
- Type-specific right-click context menus.
- Read-only details updates.
- Resizable two-thirds/one-third layout.
- Preflight warnings, blockers, and exact-name confirmation.
- Secure-configuration non-disclosure.
- Verified success and uncertain-outcome UI.

### Electron smoke

Extend the credential-free mocked Electron smoke to open the tool, load a fake catalog, search, select, expand, open a context menu, and open a modal. Verify the sandboxed preload, renderer build, and bundled sidecar continue to work.

### Isolated Dataverse release smoke

Before enabling cascade unregister, run an opt-in manual smoke against a disposable development environment: register a signed fixture assembly, create a step and image, perform a safe update, verify a breaking workflow contract is blocked, perform transactional cascade unregister, and verify all owned registrations are gone. Confirm external dependencies block deletion.

No production credentials or production assemblies are used in automated tests.

## Required Gates

API:

```text
dotnet test api/PowerTools/PowerTools.sln
dotnet publish api/PowerTools/PowerTools.API -c Release -r win-x64
```

Focused desktop tests from `desktop/`:

```text
npm test -- src/ui/tools/plugin-registration
```

Full desktop gate from `desktop/`:

```text
npm run check
```

The aggregate desktop gate runs production and test typechecking, strict zero-warning lint, Vitest, renderer build, and Electron smoke. Windows sidecar publish and packaging remain the production release gate.

## Success Criteria

- Selecting a connection loads one complete, searchable registration catalog.
- Assemblies clearly distinguish ordinary plug-ins from custom workflow activities.
- Users can register and update assemblies, steps, images, and workflow-activity metadata.
- Users can enable, disable, and unregister supported custom components.
- Every mutation has an exact current-state preflight and explicit confirmation.
- Assembly updates show handler, step, image, workflow contract, and dependency impact.
- Cascade unregister is convenient for owned descendants and never silently deletes external business components.
- Stale plans and concurrent changes cannot overwrite newer registration state.
- Uploaded DLLs are inspected without being executed or retained.
- Secure configuration and credentials are never disclosed.
- Every mutation is verified against Dataverse before success is reported.
- The approved header, resizable hierarchy, read-only details, modal, and context-menu interactions are covered by tests.
- API, desktop, Electron smoke, Windows sidecar publish, and isolated Dataverse capability checks pass before release.

## References

- [Microsoft: Register a plug-in](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-plug-in)
- [Microsoft: Event framework in Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/event-framework)
- [Microsoft: Create workflow extensions](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/workflow/workflow-extensions)
- [Microsoft: Include filtering attributes](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/best-practices/business-logic/include-filtering-attributes-plugin-registration)
- [Microsoft: Check solution component dependencies](https://learn.microsoft.com/en-us/power-platform/alm/check-solution-dependencies)
