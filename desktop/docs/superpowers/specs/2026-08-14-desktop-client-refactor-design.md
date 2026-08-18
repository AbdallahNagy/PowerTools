# Desktop Client Refactor Design

**Date:** 2026-08-14

## Objective

Refactor the complete Windows desktop client into a production-safe, testable architecture where built-in tools are straightforward to add and shared capabilities have one obvious home.

The first refactor is behavior-preserving. User-facing improvements and API restructuring are separate follow-up work.

## Scope

Included:

- React renderer and application shell.
- Built-in tool modules.
- Shared UI, hooks, data contracts, and client services.
- Typed preload and IPC boundary.
- Electron main process, windows, sidecar lifecycle, storage, authentication, and updates.
- Windows build, smoke tests, and continuous integration.

Excluded:

- ASP.NET Core API refactoring.
- Runtime or third-party plugin loading.
- macOS and Linux release gates.
- Intentional UI redesign.
- Automated tests using production Dataverse credentials.

## Current Baseline

- `npm test` passes 42 tests.
- Two valid `.test.ts` files are excluded by the current `test/*.test.mjs` glob.
- `npm run lint` passes with six warnings.
- `npm run build` passes with one malformed generated CSS warning.
- No React component or integration test stack exists.
- No desktop continuous-integration workflow exists.
- `src/electron/main.ts` has 484 lines and coordinates most privileged capabilities.
- Tools call `window.electron`, global API state, and shell contexts directly.
- `EntityInfo` is declared twice for the same `/api/metadata/entities` contract.
- Data Migration permits multiple instances but uses the shared status ID `data-migration`, so instances can overwrite or clear each other's status.

## Architectural Rules

Target renderer areas:

```text
src/ui/
├─ app/          composition, providers, routes, startup events
├─ shell/        activity bar, tabs, status bar, tool host
├─ shared/       public contracts, API, connections, status, UI
├─ platform/     typed desktop bridge adapter
└─ tools/        private built-in tool modules and central registry
```

Target Electron areas:

```text
src/electron/
├─ main.ts       application composition and lifecycle
├─ ipc/          handler registration grouped by capability
├─ services/     connections, sidecar, updates, external links
├─ windows/      main, splash, connection, and naming windows
├─ storage/      persisted state and secure credentials
└─ auth/         online authentication and token operations
```

Dependency rules:

- A tool may use public `shared/` and `platform/` modules.
- A tool may not import another tool's private files or `shell/` internals.
- `shared/` may not import tools.
- Renderer code accesses Electron only through the typed platform adapter.
- IPC handlers validate and delegate; services contain behavior.
- Existing IPC channels and user-visible results remain stable during migration.

## Built-In Tool Contract

Each tool owns one folder containing its manifest, component, private API, model, components, and tests.

```text
tools/solution-explorer/
├─ tool.ts
├─ SolutionExplorer.tsx
├─ api/
├─ components/
├─ model/
└─ tests/
```

The tool exports one typed manifest:

```ts
export const solutionExplorerTool = defineTool({
  id: "solution-explorer",
  title: "Solution Explorer",
  icon: solutionIcon,
  showInActivityBar: true,
  allowMultipleInstances: true,
  component: SolutionExplorer,
});
```

The central registry is the only list edited when a built-in tool is added. Activity-bar placement, tab title, instance policy, and component resolution derive from the manifest.

## Shared Versus Tool-Owned Code

Shared code includes:

- Data contracts representing the same backend or desktop concept.
- Authenticated API transport and shared query-key factories.
- Connection state and commands.
- Status and notification capabilities.
- Reusable UI primitives.
- Typed access to desktop operations.

Tool-owned code includes:

- Screens and components meaningful only to one tool.
- Tool workflow state, validation, and domain behavior.
- Requests and hooks used by one tool.
- Tool tests, builders, and fixtures.

Promotion rules:

- The same backend concept has one shared contract immediately.
- A proven capability used by multiple tools moves to a focused shared module.
- Code used by one tool remains private.
- Similar-looking code is not shared until its behavior and semantics are actually common.

`EntityInfo` moves to one shared Dataverse contract and both Metadata Explorer and Data Migration import it.

## Tool Runtime and Status Bar

The tool host provides the current `toolId` and unique `instanceId`. Tools do not generate or manage shell IDs.

Tools publish status declaratively:

```tsx
useToolStatus(
  job ? <MigrationStatusItem job={job} /> : null,
);
```

`useToolStatus` scopes content to the current instance, updates it when content changes, and removes it when the instance unmounts. The shell owns status-bar layout and rendering. Multiple instances of the same tool cannot collide.

## Error Handling

- Each tool instance renders inside an error boundary so one failed tool cannot crash the shell or another tab.
- Expected API and desktop failures are converted to a small shared client error shape while preserving the useful server message.
- Tools use shared toast, inline error, and status capabilities instead of ad hoc global error state.
- IPC handlers return existing expected result shapes during migration and reserve thrown errors for unexpected failures.
- Authentication refresh retries a failed request at most once.
- Failure behavior is covered before extraction: sidecar startup, connection validation, token refresh, API errors, and update states.

## Test Strategy

Primary stack:

- Vitest for TypeScript unit and integration tests.
- React Testing Library and `user-event` for renderer behavior.
- MSW for deterministic HTTP responses.
- A typed fake desktop bridge for renderer integration tests.
- A small Playwright Electron suite for Windows launch and navigation smoke coverage.

Test layers:

1. Pure unit tests for models, reducers, utilities, and services.
2. Renderer integration tests for tools, shell behavior, providers, and error states.
3. Preload and IPC contract tests for allowed methods, channels, inputs, outputs, and events.
4. Windows Electron smoke tests for startup and core navigation.
5. Optional live smoke tests against a dedicated non-production Dataverse environment.

Initial characterization coverage:

- Tool registry, activity-bar projection, tab opening, activation, naming, and closing.
- Multiple tool instances and status cleanup.
- Connection switching and query/auth cache invalidation.
- Online, on-premises, primary, and target request headers.
- Single token-refresh retry after a 401 response.
- Preload API exposure and event unsubscription.
- IPC delegation, persistence, sidecar failure, updater states, and external URL restrictions.

## Required Quality Gates

Every pull request runs on Windows:

1. Type checking.
2. ESLint with zero warnings.
3. Unit and renderer integration tests.
4. IPC contract tests.
5. Production renderer and Electron builds.
6. Small Electron smoke suite.

The Windows release gate additionally builds the NSIS installer, launches the packaged application, verifies the bundled sidecar startup, and checks update metadata.

Coverage begins with a measured baseline and ratchets upward. New or changed behavior requires meaningful branch coverage; no arbitrary global percentage is used as a substitute for behavioral tests.

## Migration Sequence

This is a program-level design. Each phase receives its own scoped implementation plan, review, and release checkpoint. The first implementation plan covers Phase 0 only.

### Phase 0: Safety foundation

- Include all existing tests.
- Introduce Vitest, React Testing Library, `user-event`, MSW, and the Electron smoke harness.
- Add characterization coverage.
- Remove lint and CSS build warnings.
- Add `npm run check` and Windows CI.

Exit: one command proves types, lint, tests, build, and smoke checks are green.

### Phase 1: Shared foundations

- Create focused contracts, API, connections, status, UI, and platform modules.
- Move duplicated contracts first.
- Use compatibility exports where required to keep tools operational.

Exit: shared ownership is clear without visible behavior changes.

### Phase 2: Tool runtime

- Add `defineTool`, the single registry, pure tab state, tool host, per-instance status, and tool error boundaries.
- Move Welcome as the low-risk canary.

Exit: a test tool requires one module folder and one registry entry.

### Phase 3: Tool migration

- Migrate Metadata Explorer first because it is primarily read-oriented.
- Migrate Data Migration second because it writes data, uses two connections, and publishes progress.

Exit: each tool passes its characterization and integration suite before the next tool moves.

### Phase 4: Electron modularization

- Extract connections, windows, sidecar, updates, external links, storage, and authentication behind focused services.
- Group IPC registration by capability.
- Add sender and input validation without changing normal application behavior.

Exit: `main.ts` contains composition and lifecycle only.

### Phase 5: Enforcement and documentation

- Remove compatibility exports and obsolete folders.
- Enforce import boundaries with ESLint.
- Add a concise built-in tool template and checklist.
- Keep layered `AGENTS.md` guidance near the code it governs.

Exit: accidental cross-tool, shell-internal, or raw Electron imports fail automated checks.

## Agent-Friendly Repository Guidance

- Root guidance identifies the repository map and production-safety rules.
- Desktop guidance defines client boundaries and required verification.
- Tool guidance defines the manifest, ownership, shared-code, and status rules.
- Electron guidance defines privileged-process and IPC rules.
- The existing `CLAUDE.md` points to `AGENTS.md` so instructions do not diverge.
- Formatting and architectural boundaries are enforced by automation rather than repeated prose.

## Success Criteria

- A built-in tool is added with one private module folder and one registry entry.
- Shared contracts and capabilities have one canonical definition and import path.
- Tools can consume connections, API, status, notifications, UI, and desktop operations through stable public APIs.
- Multiple instances of one tool have independent tab and status state.
- Tools cannot reach raw Electron IPC or another tool's internals.
- `main.ts` is a small composition root.
- Every phase remains releasable on Windows.
- A future change has automated evidence that existing tools, shell behavior, IPC, and packaging still work.

## References

- [OpenAI custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Vitest: Why Vitest](https://vitest.dev/guide/why.html)
- [Testing Library: React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest: Mocking requests](https://vitest.dev/guide/mocking/requests)
- [Playwright: Electron](https://playwright.dev/docs/api/class-electron)
- [Electron: Context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron: Security](https://www.electronjs.org/docs/latest/tutorial/security)
