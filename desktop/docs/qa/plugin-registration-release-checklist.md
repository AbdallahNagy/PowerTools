# Plugin Registration release checklist

Use this checklist for every Windows release that includes Plugin Registration. Record only environment labels, product versions, counts, durations, and pass/fail outcomes. Never record credentials, access tokens, secure configuration, connection strings, DLL bytes, or raw request/response bodies.

## Credential-free automated gates

| Gate | Required command | Current evidence |
| --- | --- | --- |
| Complete .NET solution | `dotnet test api/PowerTools/PowerTools.sln` | Passed 2026-09-01: 157 automated tests passed; 2 opt-in live tests skipped by guard |
| Windows sidecar publish | `dotnet publish api/PowerTools/PowerTools.API -c Release -r win-x64` | Passed 2026-09-01; output produced under `bin/Release/net9.0/win-x64/publish` |
| Focused renderer/API-client tests | `npm test -- src/ui/tools/plugin-registration` from `desktop/` | Passed 2026-09-01: 13 files, 69 tests |
| Full desktop aggregate | `npm run check` from `desktop/` | Passed 2026-09-01: typechecks, zero-warning lint, 47 Vitest files/226 tests, renderer build, 2 Electron smokes |
| Large API catalog | `LargeCatalogTests` (100 assemblies, 1,000 handlers, 10,000 steps, 20,000 images; 10-second Windows CI budget) | Passed locally; focused test duration 56 ms on 2026-09-01 |
| Large renderer catalog | `largeCatalog.test.tsx` (31,100 nodes; complete in-memory DTO; 10-second Windows CI budget) | Passed locally; 53 ms test body on 2026-09-01 |
| Electron Plugin Registration smoke | `npm run test:smoke:run -- --grep "browses Plugin Registration"` | Passed locally in 6.7 s on 2026-09-01 using an isolated temporary profile and intercepted fake responses |

The Electron test must prove all of the following with no persisted user profile and no real credentials:

- The real sandboxed preload and shared API client are used; no Plugin Registration IPC is added.
- The tool opens through `Browse and safely manage Dataverse plug-in registrations`.
- A fake connection in the isolated profile loads one complete direct hierarchy.
- Search finds a nested image; single click selects/expands; right click opens its typed menu; double click opens its modal.
- The details panel stays read-only.
- The isolated `--user-data-dir` is deleted after the run.

## Opt-in disposable Dataverse proof

The live project is skipped unless all three variables are present:

```text
POWERTOOLS_PLUGIN_LIVE=1
POWERTOOLS_PLUGIN_CONNECTION=<connection string whose target explicitly identifies dev/development/disposable/sandbox/test>
POWERTOOLS_PLUGIN_FIXTURE=<absolute path to a signed disposable fixture DLL>
```

The guard rejects names/URLs containing `prod` or `production`, rejects non-absolute or missing fixtures, and confirms the connected organization URL is explicitly disposable/development before creating records.

Run only after the environment owner approves the disposable target:

```powershell
dotnet test api/PowerTools/PowerTools.API.PluginRegistration.LiveTests/PowerTools.API.PluginRegistration.LiveTests.csproj -c Release
```

| Evidence | Required recorded value | Current release evidence |
| --- | --- | --- |
| Approved disposable environment | Non-secret environment display name | Not approved / not run |
| Dataverse version | Version only | Not recorded |
| Signed fixture lifecycle | Register, create step, create image, safe update | Not run |
| Referenced breaking workflow contract | Blocked before write | Not run |
| Transaction request | One child-before-parent `ExecuteTransactionRequest` | Not run |
| Atomic rollback | Intentionally failing child delete leaves the earlier child present | Not run |
| Successful cascade | Every owned image, step, handler, and assembly ID absent | Not run |
| External blocker | Custom API blocks handler deletion and remains present | Not run |

### Cascade release decision

Both atomic rollback proof and successful cascade proof are mandatory before changing the release-controlled default. The disposable live gate was not approved or executed for this implementation, so `PluginRegistrationCapabilityService` remains disabled.

**Release behavior: `Cascade unregister unsupported; no sequential fallback`.**

## Final safety review

- [x] Catalog queries exclude assembly `content` and all secure configuration values.
- [x] UI never displays secure configuration, tokens, credentials, or raw error bodies.
- [x] Mutation hooks and the shared HTTP client never replay mutation requests.
- [x] Uploaded DLL bytes are request-local, metadata-inspected only, zeroed/disposed, and never persisted or loaded.
- [x] Renderer code uses no raw Electron/preload/IPC access.
- [x] No workflow/process definition write exists.
- [x] Cascades include only owned registration IDs and never delete external dependencies.
- [x] There is no sequential cascade fallback.
- [x] There is no action history, rollback feature, saved snapshot, or stored prior DLL.
- [x] Every mutation requires signed preflight revalidation and complete readback/reconciliation.

Release sign-off requires the final diff review plus all credential-free gates above. Enabling transactional cascade additionally requires the completed live evidence table.
