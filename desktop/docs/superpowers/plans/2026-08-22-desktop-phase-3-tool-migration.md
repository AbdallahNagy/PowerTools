# Desktop Phase 3 Tool Migration Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` and `superpowers:test-driven-development` to implement this plan task-by-task.

**Goal:** Complete behavior-preserving module ownership for FetchXML Builder and Data Migration.

**Architecture:** Each built-in tool owns a typed `tool.ts` manifest and all private UI/API files below `src/ui/tools/<tool>/`. The central registry imports manifests only; tools continue using public shared connections, status, UI, contracts, and the existing authenticated API client.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest, React Testing Library, MSW, Electron, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-14-desktop-client-refactor-design.md`

## Global Constraints

- Windows desktop only; API and website are out of scope.
- Preserve visible behavior, request shapes, query keys, polling, connection selection, and status behavior.
- No runtime or third-party plugin loading.
- Use deterministic credential-free tests with mocked desktop/API boundaries.
- Do not create a branch, worktree, commit, stage files, or modify Git configuration.
- Finish each slice with `npm run check`.

---

### Task 1: FetchXML Builder manifest

**Files:**
- Create: `src/ui/tools/fetchxml-builder/tool.ts`
- Modify: `src/ui/tools/registry.tsx`
- Modify: `test/toolRegistry.test.ts`

**Interfaces:**
- Produces: `fetchXmlBuilderTool: ToolDefinition`
- Preserves: ID `fetchxml-builder`, title, tooltip, icon, activity visibility, multi-instance policy, and component.

- [ ] Add a registry test importing `fetchXmlBuilderTool` and asserting the registry uses that exact definition.
- [ ] Run the focused test and verify it fails because the manifest does not exist.
- [ ] Add the manifest and replace the inline registry definition.
- [ ] Run focused tests, then `npm run check`.

### Task 2: Data Migration characterization coverage

**Files:**
- Create: `src/ui/tools/data-migration/tests/renderer/dataMigration.test.tsx`
- Reuse: `test/support/render.tsx`, `test/support/httpServer.ts`

**Interfaces:**
- Covers: hosted rendering, selected source connection, migration request behavior, and instance-scoped progress status.

- [ ] Add deterministic characterization tests around observable Data Migration behavior using MSW and the fake desktop bridge.
- [ ] Run the focused tests against the legacy component before moving files.
- [ ] Run `npm run check`.

### Task 3: Data Migration UI module and manifest

**Files:**
- Create: `src/ui/tools/data-migration/tool.ts`
- Move: `src/ui/components/tools/DataMigration/index.tsx` to `src/ui/tools/data-migration/DataMigration.tsx`
- Move: remaining Data Migration UI files to `src/ui/tools/data-migration/components/`
- Move: `src/ui/assets/icons/data-migration-icon.svg` to `src/ui/tools/data-migration/data-migration-icon.svg`
- Modify: `src/ui/tools/registry.tsx`
- Modify: relevant test imports

**Interfaces:**
- Produces: `dataMigrationTool: ToolDefinition`
- Preserves: ID `data-migration`, title, tooltip, icon, activity visibility, multi-instance policy, and component behavior.

- [ ] Add a failing manifest/registry identity assertion.
- [ ] Move the files without changing component logic and update relative imports.
- [ ] Replace the inline registry definition with `dataMigrationTool`.
- [ ] Run focused tests, then `npm run check`.

### Task 4: Data Migration private API ownership

**Files:**
- Move: `src/ui/api/hooks/useEntities.ts` to `src/ui/tools/data-migration/api/useEntities.ts`
- Move: `src/ui/api/hooks/useEntityAttributes.ts` to `src/ui/tools/data-migration/api/useEntityAttributes.ts`
- Move: `src/ui/api/hooks/usePreviewRecords.ts` to `src/ui/tools/data-migration/api/usePreviewRecords.ts`
- Move: `src/ui/api/hooks/useMigrationJob.ts` to `src/ui/tools/data-migration/api/useMigrationJob.ts`
- Modify: Data Migration component imports
- Add or update: module-local deterministic API tests

**Interfaces:**
- Preserves all hook signatures, endpoints, request bodies, query keys, connection metadata, stale times, enablement, and one-second active-job polling.

- [ ] Add boundary tests that fail when the new module-local imports do not exist.
- [ ] Move the hooks and update imports without changing implementations.
- [ ] Verify no production references remain at the legacy paths.
- [ ] Run focused tests, then `npm run check`.

### Task 5: Phase 3 exit audit

**Files:**
- Review all current Phase 3 changes; modify only if a tested blocker is found.

- [ ] Verify each tool has one folder and typed manifest.
- [ ] Verify the registry contains imports and ordered entries only.
- [ ] Verify no cross-tool, raw Electron, or manual status-ID imports were introduced.
- [ ] Obtain an independent read-only review.
- [ ] Run final `npm run check` and record the results.
