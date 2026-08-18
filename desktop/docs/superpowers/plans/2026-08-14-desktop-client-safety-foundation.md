# Desktop Client Safety Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one Windows command prove that the current desktop renderer, Electron boundary, builds, and core launch path still work before architectural refactoring begins.

**Architecture:** Keep production modules in their current locations during Phase 0. Replace the incomplete Node test entry point with Vitest projects for Node and jsdom, add reusable deterministic test adapters, characterize current shell/API/preload behavior, then enforce the suite through a Windows CI workflow. Only small behavior-neutral test seams and warning fixes are allowed.

**Tech Stack:** TypeScript 5.8, React 19, Electron 39, Vite 6, Vitest 4, React Testing Library, user-event, jest-dom, MSW 2, Playwright Electron, ESLint 9, GitHub Actions on `windows-latest`.

## Global Constraints

- Windows is the only production and CI target in this phase.
- Preserve user-visible behavior and all existing IPC channel names and result shapes.
- Do not move tools into the target architecture yet; Phase 0 creates safety rails only.
- Do not call production Dataverse environments or use production credentials in automated tests.
- HTTP tests use MSW; renderer desktop calls use the typed fake bridge.
- Playwright covers only launch and one core navigation path because Electron support is experimental.
- ESLint must finish with zero warnings and the production CSS build must emit no optimizer warnings.
- Coverage records a baseline without introducing an arbitrary repository-wide percentage gate.
- Do not create or switch branches and do not commit. Leave every change in the working tree for user review.
- For production logic, follow red-green-refactor. For configuration-only changes, use the failing command or warning output as RED and clean command output as GREEN.

---

## File Map

- `vitest.config.ts`: two isolated Vitest projects: Node contracts and jsdom renderer behavior.
- `tsconfig.test.json`: strict type checking for test TypeScript and TSX.
- `test/setup/node.ts`: deterministic MSW lifecycle and mock cleanup for Node tests after Task 2.
- `test/setup/renderer.ts`: jest-dom, Testing Library cleanup, MSW lifecycle, and fake timers/mocks cleanup after Task 2.
- `test/support/httpServer.ts`: one shared MSW server definition with no permissive default handlers.
- `test/support/desktopBridge.ts`: complete typed fake of `Window["electron"]`, including event emitters and unsubscribe behavior.
- `test/support/render.tsx`: fresh `QueryClient` and renderer helper for every test.
- `test/renderer/shell.test.tsx`: activity projection, tab lifecycle, multiple instances, status updates, and cleanup.
- `test/renderer/apiClient.test.ts`: authenticated headers, caches, target headers, and one-refresh-only 401 behavior.
- `src/electron/preloadApi.cts`: pure factory for the exact API exposed by preload.
- `test/electron/preloadApi.test.ts`: preload invoke/event contract characterization.
- `playwright.config.ts`: Windows Electron smoke configuration and Vite web server lifecycle.
- `test/smoke/app.spec.ts`: launch, Welcome visibility, and Metadata Explorer navigation.
- `.github/workflows/desktop-ci.yml`: clean Windows verification job.
- Existing context/provider files: warning-only splits that keep behavior and import ownership unchanged.

---

### Task 1: Adopt Vitest Without Losing Existing Coverage

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `tsconfig.test.json`
- Modify: `tsconfig.node.json`
- Modify: `test/*.test.mjs`
- Modify: `test/*.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the current `npm test` contract and Electron output in `dist-electron/`.
- Produces: `npm test`, `npm run test:coverage`, and `npm run typecheck`; Vitest projects named `node` and `renderer`.

- [ ] **Step 1: Record the incomplete baseline**

  Run `npm test` and record 42 passing tests. Then run `node --test test/*.test.ts` and record the two tests excluded by the old glob.

- [ ] **Step 2: Install the stable test dependencies**

  Install compatible stable releases of `vitest@^4`, `@vitest/coverage-v8@^4`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `msw@^2`, `@playwright/test`, `playwright`, and `@types/node` as dev dependencies. Keep the generated lockfile.

- [ ] **Step 3: Configure explicit Node and renderer projects**

  Create `vitest.config.ts` with React/Vite transforms and these non-overlapping projects:

  ```ts
  import react from "@vitejs/plugin-react";
  import { defineConfig } from "vitest/config";

  export default defineConfig({
    plugins: [react()],
    test: {
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "json-summary"],
        reportsDirectory: "coverage",
      },
      projects: [
        {
          extends: true,
          test: {
            name: "node",
            environment: "node",
            include: ["test/*.test.{mjs,ts}", "test/electron/**/*.test.ts"],
            clearMocks: true,
            restoreMocks: true,
          },
        },
        {
          extends: true,
          test: {
            name: "renderer",
            environment: "jsdom",
            include: ["test/renderer/**/*.test.{ts,tsx}"],
            clearMocks: true,
            restoreMocks: true,
          },
        },
      ],
    },
  });
  ```

- [ ] **Step 4: Make test TypeScript part of type checking**

  Create `tsconfig.test.json` extending `tsconfig.app.json`, include `test/**/*.ts` and `test/**/*.tsx`, add `types` for Node, Vitest, and jest-dom, and use its own `tsBuildInfoFile`. Add `vitest.config.ts` and `playwright.config.ts` to `tsconfig.node.json`.

- [ ] **Step 5: Migrate existing tests to Vitest assertions**

  Replace `node:test` and `node:assert/strict` imports with `import { expect, test } from "vitest"`. Apply these semantic mappings without changing fixtures or expected values:

  ```text
  assert.equal(actual, expected)        -> expect(actual).toBe(expected)
  assert.deepEqual(actual, expected)    -> expect(actual).toEqual(expected)
  assert.match(actual, regex)           -> expect(actual).toMatch(regex)
  assert.doesNotMatch(actual, regex)    -> expect(actual).not.toMatch(regex)
  await assert.rejects(promise, regex)  -> await expect(promise).rejects.toThrow(regex)
  ```

- [ ] **Step 6: Replace the incomplete test command**

  Set `test` to `npm run transpile:electron && vitest run`, add `test:coverage` with the same transpile prerequisite and `vitest run --coverage`, and add `typecheck` for the production and test TypeScript projects. Add `coverage` and `playwright-report` to `.gitignore`.

- [ ] **Step 7: Verify all existing tests are collected**

  Run `npm test`. Expected: 44 existing tests pass under the `node` project, including `lookupRecords.test.ts` and `fetchxmlFormat.test.ts`.

- [ ] **Step 8: Review checkpoint**

  Inspect only Task 1 files, confirm no assertions or expected values changed, and leave the diff uncommitted.

---

### Task 2: Add Deterministic Renderer Test Capabilities

**Files:**
- Create: `test/support/httpServer.ts`
- Create: `test/support/desktopBridge.ts`
- Create: `test/support/render.tsx`
- Create: `test/setup/node.ts`
- Create: `test/setup/renderer.ts`
- Create: `test/renderer/desktopBridge.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `Window["electron"]`, React Query, MSW 2, Vitest, and Testing Library.
- Produces: `createFakeDesktopBridge(overrides?)`, `installDesktopBridge(bridge)`, `renderWithProviders(ui, options?)`, `createTestQueryClient()`, and `httpServer`.

- [ ] **Step 1: Write a failing fake-bridge lifecycle test**

  Test that two `onConnectionsUpdated` listeners receive an emitted value, calling one returned unsubscribe removes only that listener, and the complete fake supplies safe defaults for every method in `Window["electron"]`.

- [ ] **Step 2: Run the renderer test and confirm RED**

  Run `npx vitest run --project renderer test/renderer/desktopBridge.test.ts`. Expected: failure because `test/support/desktopBridge.ts` does not exist.

- [ ] **Step 3: Implement the typed fake bridge**

  Implement a full `Window["electron"]` object. Use listener sets for `onConnectionsUpdated` and `onUpdateStatusChanged`, expose test-only `emitConnectionStatusUpdate`, `emitConnectionsUpdated`, and `emitUpdateStatusChanged` methods on the returned fake, and merge typed method overrides without accepting an untyped partial object.

- [ ] **Step 4: Add shared HTTP and renderer setup**

  Export `httpServer = setupServer()` with no default handlers. In both setup files use `listen({ onUnhandledRequest: "error" })`, reset handlers after each test, and close after all tests. Renderer setup additionally imports `@testing-library/jest-dom/vitest` and calls Testing Library `cleanup` after each test. Register these two setup files in their matching Vitest projects.

- [ ] **Step 5: Add the provider-aware render helper**

  `createTestQueryClient()` must set query retries to `false`, garbage collection to `Infinity`, and refetch-on-focus to `false`. `renderWithProviders` installs a fresh fake bridge and renders through a fresh `QueryClientProvider`, returning the render result plus the query client and fake bridge.

- [ ] **Step 6: Verify GREEN and type safety**

  Run the focused renderer test, then `npm run typecheck`. Expected: both pass with no `any` added to test-support public interfaces.

- [ ] **Step 7: Review checkpoint**

  Review the fake against every member in `vite-env.d.ts`; confirm tests assert emitted behavior rather than mock call existence.

---

### Task 3: Characterize the Existing Shell

**Files:**
- Create: `test/renderer/shell.test.tsx`
- Test only: `src/ui/tools/registry.tsx`
- Test only: `src/ui/context/TabContext.tsx`
- Test only: `src/ui/context/StatusBarContext.tsx`
- Test only: `src/ui/components/layout/ActivityBar.tsx`

**Interfaces:**
- Consumes: `renderWithProviders`, `TabProvider`, `useTabs`, `StatusBarProvider`, `useStatusBar`, and the existing registry.
- Produces: behavior locks for activity projection, tab naming/activation/closing, multiple instances, status replacement by ID, and unmount cleanup.

- [ ] **Step 1: Write activity and tab behavior tests**

  Render the real `ActivityBar` inside `TabProvider`. Assert Data Migration and Metadata Explorer are visible in registry order, Welcome is not an activity action, opening Metadata Explorer twice creates `Metadata Explorer` and `Metadata Explorer 2`, and the second instance becomes active. Stub `Date.now()` with distinct literal values so instance IDs are deterministic.

- [ ] **Step 2: Run focused tests and confirm characterization failures are meaningful**

  Run `npx vitest run --project renderer test/renderer/shell.test.tsx`. Configuration/import failures are not acceptable RED; correct them until the tests execute real components.

- [ ] **Step 3: Add tab close and singleton coverage**

  Assert closing the active second tool instance activates its left neighbor. Assert opening the singleton Welcome tool activates the existing Welcome tab without adding another tab.

- [ ] **Step 4: Add status lifecycle coverage**

  Mount two small real publisher components that call the current `setStatus`/`clearStatus` API with distinct IDs. Assert both contents render, rerendering replaces content for the same ID, and unmount removes only the publisher’s item. Do not encode the known Data Migration hard-coded-ID defect as desired behavior.

- [ ] **Step 5: Verify the focused suite and all Node tests**

  Run the shell test and `npm test`. Expected: renderer behavior is characterized and all prior tests remain green.

- [ ] **Step 6: Review checkpoint**

  Confirm selectors are accessible roles/names and tests observe UI/state behavior rather than registry implementation details.

---

### Task 4: Characterize Authentication, Headers, Caches, and 401 Retry

**Files:**
- Create: `test/renderer/apiClient.test.ts`
- Test only: `src/ui/api/client.ts`

**Interfaces:**
- Consumes: `httpServer`, `createFakeDesktopBridge`, Axios through the real exported `api`, and `vi.resetModules()`.
- Produces: deterministic contracts for bootstrap headers, primary and target auth, on-premises headers, auth caching, and one retry after 401.

- [ ] **Step 1: Write the primary online and bootstrap header test**

  Install a fake bridge returning `http://127.0.0.1:43123`, `local-secret`, and a complete online active connection. Use MSW to capture a request and assert literal `X-Local-Secret`, `Authorization: Bearer primary-token`, and `X-Environment-Url` values.

- [ ] **Step 2: Run focused test and establish RED/GREEN against the real client**

  Reset modules before importing `client.ts` so module caches do not cross test cases. Run `npx vitest run --project renderer test/renderer/apiClient.test.ts`; correct only the test harness until current behavior is observed.

- [ ] **Step 3: Add on-premises and target connection cases**

  Assert an on-premises primary sends `X-Connection-Name` without `Authorization`. For `meta.targetConnectionName`, assert the complete online target sends `X-Target-Authorization` and `X-Target-Environment-Url`; assert an on-premises target sends `X-Target-Connection-Name`.

- [ ] **Step 4: Add cache behavior**

  Make two successful requests and assert the observable bridge connection lookup count remains one. Call `clearAuthCache()`, make another request, and assert a new lookup occurs.

- [ ] **Step 5: Add the one-refresh-only 401 case**

  Make MSW return 401 once and 200 after retry. Assert the retry carries the refreshed token and refresh happens once. Add a separate always-401 handler and assert the request rejects after exactly two HTTP attempts rather than looping.

- [ ] **Step 6: Verify focused and aggregate tests**

  Run the API client test and `npm test`. Expected: deterministic tests pass with `onUnhandledRequest: "error"` and no real network traffic.

- [ ] **Step 7: Review checkpoint**

  Confirm each fake connection mirrors every field in the real `ConnectionResult` branch and expected header literals are independent of production helpers.

---

### Task 5: Characterize the Preload Contract Through a Pure Factory

**Files:**
- Create: `src/electron/preloadApi.cts`
- Modify: `src/electron/preload.cts`
- Create: `test/electron/preloadApi.test.ts`
- Modify if required: `src/electron/tsconfig.json`

**Interfaces:**
- Consumes: an `ipcRenderer` object exposing `invoke`, `on`, and `removeListener`.
- Produces: `createPreloadApi(ipcRenderer)` with the exact current `window.electron` method names and channel mappings.

- [ ] **Step 1: Write failing channel and event tests**

  Import `createPreloadApi` from the source `.cts` module. Assert representative commands invoke the exact existing channels and arguments. Register connection/update callbacks, invoke captured listeners with an ignored event plus payload, and assert the returned unsubscribe removes the same listener reference.

- [ ] **Step 2: Run the focused test and confirm RED**

  Run `npx vitest run --project node test/electron/preloadApi.test.ts`. Expected: failure because the factory does not exist.

- [ ] **Step 3: Extract the pure factory with no channel changes**

  Move the exposed object construction into `createPreloadApi`. Keep `preload.cts` responsible only for requiring Electron and calling `contextBridge.exposeInMainWorld("electron", createPreloadApi(ipcRenderer))`.

- [ ] **Step 4: Cover the complete public surface**

  Use table-driven literal channel expectations for all invoke methods. Cover payload forwarding for connection and update events and cleanup for the two APIs that currently return unsubscribe callbacks. Preserve the current `onConnectionStatusUpdate` return type and behavior.

- [ ] **Step 5: Verify preload output and existing Electron tests**

  Run the focused test, `npm run transpile:electron`, and `npm test`. Expected: the source contract, emitted CommonJS preload output, and all existing Electron behavior pass.

- [ ] **Step 6: Review checkpoint**

  Compare the factory keys and TypeScript declaration one-for-one; verify no renderer privilege or channel was added.

---

### Task 6: Remove Existing Lint and CSS Build Warnings

**Files:**
- Modify: `src/ui/components/ui/Toast.tsx`
- Create: focused context/hook files beside `Toast.tsx`, `TabContext.tsx`, `StatusBarContext.tsx`, `MetadataExplorerContext.tsx`, and `DragContext.tsx`
- Modify: imports returned by `rg -n "useToast|useTabs|useStatusBar|useMetadataExplorer|useDrag" src/ui`
- Modify: `src/ui/App.css`
- Create or modify: relevant renderer characterization tests

**Interfaces:**
- Consumes: the same provider and hook APIs currently used by production components.
- Produces: component-only provider modules, hook-only modules, stable toast IDs via `useRef`, and Tailwind scanning scoped to `src/ui`.

- [ ] **Step 1: Capture RED from quality commands**

  Run `npm run lint` and record the six existing warnings. Run `npm run build` and record the malformed `.bg-[var(--color-<name>)]` optimizer warning.

- [ ] **Step 2: Protect provider and toast behavior**

  Extend renderer tests to show each hook throws outside its provider, providers expose the same commands/state, and two simultaneously visible toasts can be dismissed independently. Run them before refactoring.

- [ ] **Step 3: Split hooks from component modules**

  Put context values/types in non-TSX context modules, providers in component-only TSX modules, and consumer hooks in hook-only modules. Update every import discovered by `rg`; do not introduce compatibility re-exports that recreate Fast Refresh warnings.

- [ ] **Step 4: Preserve toast ID semantics without a stale closure warning**

  Replace the render-local mutable counter captured by an empty dependency array with `const nextId = useRef(0)` and increment `nextId.current`. Keep the 6000 ms lifetime, ordering, messages, and colors unchanged.

- [ ] **Step 5: Scope Tailwind source detection**

  Change the Tailwind import to use an explicit source base rooted at `src/ui` (relative `source(".")` from `App.css`). Do not change generated utility names or visual styles.

- [ ] **Step 6: Verify GREEN**

  Run focused renderer tests, `npm run lint -- --max-warnings 0`, and `npm run build`. Expected: tests pass, ESLint reports zero warnings, and Vite emits no malformed CSS optimizer warning.

- [ ] **Step 7: Review checkpoint**

  Confirm the diff is file separation plus the semantically equivalent toast ref, and compare all changed import sites with `rg` output.

---

### Task 7: Add the Windows Electron Smoke Gate and Aggregate CI

**Files:**
- Create: `playwright.config.ts`
- Create: `test/smoke/app.spec.ts`
- Create: `.github/workflows/desktop-ci.yml`
- Modify: `package.json`
- Modify: `package-lock.json` only if Playwright installation updates it

**Interfaces:**
- Consumes: compiled `dist-electron/main.js`, built `dist-react`, Vite on port 5123, the local .NET 9 sidecar, and Playwright’s experimental Electron launcher.
- Produces: `npm run test:smoke`, `npm run check`, and the `Desktop CI` Windows workflow.

- [ ] **Step 1: Write the smoke test before wiring the command**

  Launch Electron with `args: ["."]`, the desktop directory as `cwd`, and `NODE_ENV=development`. Wait for the non-splash window whose URL is `http://localhost:5123/`, assert the Welcome heading is visible, click the accessible Metadata Explorer activity button, and assert a Metadata Explorer tab appears. Always close Electron in `finally`.

- [ ] **Step 2: Run the smoke file and confirm RED**

  Run `npx playwright test test/smoke/app.spec.ts`. Expected: failure because the Vite server/config or compiled assets are not wired yet, not because of an unavailable production credential.

- [ ] **Step 3: Configure deterministic local smoke execution**

  Configure one worker, no retries locally, two retries in CI, trace on first retry, and a Vite `webServer` command bound to port 5123. Add a self-contained `test:smoke` script that transpiles Electron, builds the renderer, and runs Playwright.

- [ ] **Step 4: Add the aggregate command**

  Add `build:renderer` and `test:smoke:run` internal scripts. Define `check` as the serial gate for strict type checking, zero-warning lint, all Vitest projects, renderer production build, and smoke execution without performing the same build step twice.

- [ ] **Step 5: Add Windows CI**

  Create a least-privilege workflow triggered by desktop-relevant pull requests and main pushes. Use `actions/checkout@v4`, `actions/setup-node@v4` with Node 24 and npm cache keyed by `desktop/package-lock.json`, `actions/setup-dotnet@v4` with .NET 9, `npm ci`, and `npm run check` from `desktop/`. Upload `playwright-report` only on failure.

- [ ] **Step 6: Verify smoke and the complete gate**

  Run `npm run test:smoke`, then `npm run check`. Expected: Electron launches on Windows, the tool navigation assertion passes, all tests pass, lint has zero warnings, and builds complete without warnings.

- [ ] **Step 7: Record the coverage baseline**

  Run `npm run test:coverage` and record statement/branch/function/line values in the implementation report. Do not add thresholds in Phase 0.

- [ ] **Step 8: Final review checkpoint**

  Review the whole working-tree diff against this plan and the design spec. Confirm no branches or commits were created, no API project files changed, no credentials are present, and all generated reports/build outputs remain ignored.
