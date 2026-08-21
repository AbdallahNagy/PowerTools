# FetchXML Builder Tool Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Metadata Explorer with a self-contained FetchXML Builder tool while preserving every existing query-building and execution behavior.

**Architecture:** Move tool-private renderer code, icon, and tests under `src/ui/tools/fetchxml-builder/`. Keep the central registry as the shell integration point and move the duplicated `EntityInfo` backend contract to `src/ui/shared/contracts/dataverse.ts`; do not introduce the future `defineTool` runtime in this refactor.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library, Playwright Electron, Vite.

**Spec:** `desktop/docs/superpowers/specs/2026-08-18-fetchxml-builder-tool-refactor-design.md`

## Global Constraints

- Windows is the release target.
- Preserve production behavior except for the approved complete rename.
- Use ID `fetchxml-builder`, title `FetchXML Builder`, and tooltip `Build, run, and refine FetchXML queries`.
- Do not change API payloads, FetchXML semantics, validation, paging, results, or error handling.
- Keep normal tests deterministic and free of production credentials.
- Do not add `defineTool` or refactor Data Migration, Electron, API transport, or shared UI.
- Do not create a branch, stage files, or commit changes.

---

### Task 1: Create the Canonical Dataverse Entity Contract

**Files:**
- Create: `desktop/src/ui/shared/contracts/dataverse.ts`
- Create: `desktop/src/ui/shared/contracts/dataverse.test.ts`
- Modify: `desktop/vitest.config.ts`
- Modify: `desktop/src/ui/api/hooks/useEntities.ts`
- Modify: `desktop/src/ui/components/tools/DataMigration/index.tsx`
- Modify: `desktop/src/ui/components/tools/DataMigration/EntityListPanel.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/model/types.ts`

**Interfaces:**
- Produces: `EntityInfo` from `src/ui/shared/contracts/dataverse.ts`.
- Preserves: `useEntities(connectionName: string | null)` and its request behavior.

- [ ] **Step 1: Add a failing canonical-contract test**

Add `dataverse.test.ts` with an explicit Vitest import and a representative object:

```ts
import { describe, expect, it } from "vitest";
import type { EntityInfo } from "./dataverse";

describe("Dataverse contracts", () => {
  it("defines the shared entity metadata shape", () => {
    const entity = {
      logicalName: "account",
      displayName: "Account",
      primaryIdAttribute: "accountid",
      primaryNameAttribute: "name",
      isCustom: false,
    } satisfies EntityInfo;

    expect(entity).toEqual({
      logicalName: "account",
      displayName: "Account",
      primaryIdAttribute: "accountid",
      primaryNameAttribute: "name",
      isCustom: false,
    });
  });
});
```

- [ ] **Step 2: Verify the new import fails**

Run: `npx vitest run src/ui/shared/contracts/dataverse.test.ts --project node`

Expected: FAIL because `./dataverse` does not exist or because the node project does not yet discover the colocated test.

- [ ] **Step 3: Add shared-test discovery and the canonical interface**

Add `"src/ui/shared/**/*.test.ts"` to the node project's `include` array in `vitest.config.ts`. Create `dataverse.ts`:

```ts
export interface EntityInfo {
  logicalName: string;
  displayName: string;
  primaryIdAttribute: string;
  primaryNameAttribute: string;
  isCustom: boolean;
}
```

- [ ] **Step 4: Replace duplicate ownership**

Import `EntityInfo` from the shared contract in `useEntities.ts`, Data Migration, and Metadata Explorer. Remove both duplicate interface declarations. During this task only, `MetadataExplorer/model/types.ts` may re-export the canonical type so unchanged private imports continue compiling:

```ts
export type { EntityInfo } from "../../../../shared/contracts/dataverse";
```

Do not change query keys, endpoints, headers, or response handling.

- [ ] **Step 5: Verify the contract slice**

Run:

```text
npx vitest run src/ui/shared/contracts/dataverse.test.ts --project node
npm run typecheck
npm test
```

Expected: the contract test and all existing tests pass.

---

### Task 2: Rename the Runtime Tool Identity

**Files:**
- Modify: `desktop/test/renderer/shell.test.tsx`
- Modify: `desktop/test/smoke/app.spec.ts`
- Modify: `desktop/src/ui/tools/registry.tsx`

**Interfaces:**
- Consumes: existing `ToolDefinition` and `TabProvider` behavior.
- Produces: registry key/tool ID `fetchxml-builder`, title `FetchXML Builder`, tooltip `Build, run, and refine FetchXML queries`.

- [ ] **Step 1: Change shell expectations first**

Import `TOOL_REGISTRY` from `../../src/ui/tools/registry`, rename the two Metadata Explorer shell cases, and replace their exact expectations:

```ts
const fetchXmlBuilder = screen.getByRole("button", {
  name: "Build, run, and refine FetchXML queries",
});

expect(screen.getByRole("status", { name: "open tab titles" }).textContent).toBe(
  "Welcome | FetchXML Builder | FetchXML Builder 2",
);
expect(screen.getByRole("status", { name: "active tab" }).textContent).toBe(
  "fetchxml-builder-202",
);
expect(TOOL_REGISTRY["metadata-explorer"]).toBeUndefined();
```

Keep the existing ordering, singleton Welcome, close fallback, and status assertions exact.

- [ ] **Step 2: Verify the identity test fails**

Run: `npx vitest run test/renderer/shell.test.tsx --project renderer`

Expected: FAIL because the registry still exposes Metadata Explorer.

- [ ] **Step 3: Rename the registry entry atomically**

Change the key and `toolId` to `fetchxml-builder`, the title to `FetchXML Builder`, the tooltip to the approved text, and the activity-bar lookup to `TOOL_REGISTRY["fetchxml-builder"]`. The component may still come from the old folder until Task 3.

- [ ] **Step 4: Update the smoke contract**

Rename the smoke test and change only its accessible button and exact tab-title expectations:

```ts
await mainWindow
  .getByRole("button", { name: "Build, run, and refine FetchXML queries" })
  .click();

await expect(mainWindow.getByText("FetchXML Builder", { exact: true })).toBeVisible();
```

Keep isolated `userData`, application launch, cleanup, and all security assertions unchanged.

- [ ] **Step 5: Verify renderer identity and real launch**

Run:

```text
npx vitest run test/renderer/shell.test.tsx --project renderer
npm run test:smoke
```

Expected: shell tests and Electron smoke pass with the new identity.

---

### Task 3: Move and Rename the Tool Module

**Files:**
- Move: `desktop/src/ui/assets/icons/metadata-explorer-icon.svg` to `desktop/src/ui/tools/fetchxml-builder/fetchxml-builder-icon.svg`
- Move: `desktop/src/ui/components/tools/MetadataExplorer/index.tsx` to `desktop/src/ui/tools/fetchxml-builder/index.tsx`
- Move: `FetchXmlModal.tsx`, `FetchXmlView.tsx`, `ResultsGrid.tsx`, and `TableSelector.tsx` to `desktop/src/ui/tools/fetchxml-builder/components/`
- Move: `FilterBuilder/*` to `desktop/src/ui/tools/fetchxml-builder/components/filter-builder/`
- Move: `hooks/*` to `desktop/src/ui/tools/fetchxml-builder/hooks/`
- Move: `model/*` to `desktop/src/ui/tools/fetchxml-builder/model/`
- Move and rename: `MetadataExplorerContext.ts` to `desktop/src/ui/tools/fetchxml-builder/context/FetchXmlBuilderContext.ts`
- Move and rename: `MetadataExplorerProvider.tsx` to `desktop/src/ui/tools/fetchxml-builder/context/FetchXmlBuilderProvider.tsx`
- Move and rename: `useMetadataExplorer.ts` to `desktop/src/ui/tools/fetchxml-builder/context/useFetchXmlBuilder.ts`
- Modify: `desktop/src/ui/tools/registry.tsx`
- Modify imports: `desktop/test/dynamicsRecordUrl.test.mjs`, `desktop/test/fetchxmlFormat.test.ts`, `desktop/test/fetchxmlRelationship.test.mjs`, `desktop/test/filterTreeRelationship.test.mjs`, `desktop/test/lookupRecords.test.ts`, `desktop/test/resultSummary.test.mjs`, and `desktop/test/renderer/contextContracts.test.tsx`

**Interfaces:**
- Consumes: shared `EntityInfo`, existing API client, shared UI primitives, and `window.electron` behavior.
- Produces: default `FetchXmlBuilder` component and named `FetchXmlBuilderIcon` export from the folder's public `index.tsx`.

- [ ] **Step 1: Add a failing public component-identity assertion**

Extend the shell test to express the public component name expected after the move:

```ts
expect(TOOL_REGISTRY["fetchxml-builder"].component.name).toBe("FetchXmlBuilder");
```

- [ ] **Step 2: Verify the public entry is absent**

Run: `npx vitest run test/renderer/shell.test.tsx --project renderer`

Expected: FAIL because the registered component is still named `MetadataExplorer`.

- [ ] **Step 3: Perform the mechanical folder moves**

Move every current Metadata Explorer file into the target structure without changing function bodies. Preserve filename casing for components and model files; use lowercase `filter-builder` for its directory. Do not delete or rewrite unrelated files under `components/tools/`.

- [ ] **Step 4: Rename private symbols and repair imports**

Use these exact names:

```ts
FetchXmlBuilder
FetchXmlBuilderPage
FetchXmlBuilderContext
FetchXmlBuilderContextValue
FetchXmlBuilderProvider
FetchXmlBuilderProviderProps
useFetchXmlBuilder
```

The hook error must become:

```ts
throw new Error("useFetchXmlBuilder must be used within FetchXmlBuilderProvider");
```

Import `EntityInfo` directly from `../../shared/contracts/dataverse` or the correct relative equivalent; remove its temporary re-export from the private model. Repair shared UI/API relative paths only—do not change their behavior. Export the icon from `index.tsx`:

```ts
export { default as FetchXmlBuilderIcon } from "./fetchxml-builder-icon.svg";
```

Update the existing centralized private-test imports to the new module paths so the suite remains green before Task 4 colocates those files. Update the mixed renderer context test to use the renamed provider and hooks without changing its assertions yet.

- [ ] **Step 5: Point the registry at the public entry**

Replace both old imports with:

```ts
import FetchXmlBuilder, { FetchXmlBuilderIcon } from "./fetchxml-builder";
```

Use those exports in the existing definition. Do not introduce a manifest or `defineTool`.

- [ ] **Step 6: Verify production compilation and behavior tests**

Run:

```text
npm run typecheck
npm test
npm run build
```

Expected: all commands pass and no production import references the old folder.

---

### Task 4: Move Tool-Private Tests Beside the Tool

**Files:**
- Modify: `desktop/vitest.config.ts`
- Modify: `desktop/tsconfig.app.json`
- Modify: `desktop/tsconfig.test.json`
- Move to `desktop/src/ui/tools/fetchxml-builder/tests/node/`: `dynamicsRecordUrl.test.mjs`, `fetchxmlFormat.test.ts`, `fetchxmlRelationship.test.mjs`, `filterTreeRelationship.test.mjs`, `lookupRecords.test.ts`, `resultSummary.test.mjs`
- Create: `desktop/src/ui/tools/fetchxml-builder/tests/renderer/contextContracts.test.tsx`
- Modify: `desktop/test/renderer/contextContracts.test.tsx`

**Interfaces:**
- Consumes: FetchXML Builder private models, hooks, context, and drag provider.
- Produces: node and renderer test discovery patterns for colocated built-in-tool tests.

- [ ] **Step 1: Move one private test before changing discovery**

Move `fetchxmlFormat.test.ts` to the node test folder and update its import to `../../model/fetchxmlFormat`.

- [ ] **Step 2: Prove normal discovery does not yet include it**

Run: `npx vitest run src/ui/tools/fetchxml-builder/tests/node/fetchxmlFormat.test.ts --project node`

Expected: FAIL with no matching test files because the node project include pattern does not cover colocated tool tests.

- [ ] **Step 3: Add precise tool-test discovery**

Add these patterns without broadening projects into each other's environments:

```ts
// node project
"src/ui/tools/**/tests/node/**/*.test.{mjs,ts}"

// renderer project
"src/ui/tools/**/tests/renderer/**/*.test.{ts,tsx}"
```

Exclude colocated `*.test.ts` and `*.test.tsx` files from `tsconfig.app.json`, include them in `tsconfig.test.json`, and retain the test config's Vitest and jest-dom types. This keeps test code out of the production TypeScript project while continuing to typecheck it explicitly.

- [ ] **Step 4: Move the remaining model tests**

Move the five remaining private tests and update imports to the new private model/hook paths. Keep all test cases and expected output unchanged; convert extensions only if TypeScript requires it.

- [ ] **Step 5: Split the mixed renderer context test**

Create the colocated renderer test containing the renamed FetchXML Builder provider/hook contract and the private drag provider/hook contract. It must assert both the exact outside-provider errors and the same provider state/commands.

Remove only those builder-owned imports, helper components, and assertions from central `test/renderer/contextContracts.test.tsx`; retain Toast, Tab, and StatusBar coverage there.

- [ ] **Step 6: Verify both environments and total coverage**

Run:

```text
npx vitest run src/ui/tools/fetchxml-builder/tests/node --project node
npx vitest run src/ui/tools/fetchxml-builder/tests/renderer --project renderer
npm test
npm run typecheck
```

Expected: all moved tests are discovered exactly once and the full test count does not decrease.

---

### Task 5: Enforce the Completed Rename and Run the Windows Gate

**Files:**
- Modify only if required by evidence from the checks above.

**Interfaces:**
- Produces: a review-ready, behavior-preserving FetchXML Builder module with no old runtime identity or imports.

- [ ] **Step 1: Scan for forbidden old ownership references**

Run from `desktop/`:

```text
rg -n "components/tools/MetadataExplorer|components\\tools\\MetadataExplorer|useMetadataExplorer|MetadataExplorerProvider|metadata-explorer|Metadata Explorer" src test
```

Expected: no production/test imports, runtime IDs, component symbols, or visible titles remain. Historical docs are outside this enforcement scan.

- [ ] **Step 2: Review dependency boundaries**

Confirm:

```text
- registry imports only ./fetchxml-builder public exports
- Data Migration imports EntityInfo from shared/contracts/dataverse
- FetchXML Builder imports no Data Migration private file
- shared/contracts imports no tool
- no request, query key, IPC, or Electron method changed
```

- [ ] **Step 3: Run the complete Windows validation gate**

Run: `npm run check`

Expected: typecheck, zero-warning lint, all Vitest projects, renderer build, and isolated-profile Electron smoke pass.

- [ ] **Step 4: Review the final diff without staging**

Run:

```text
git status --short
git diff --stat
git diff -- desktop/src desktop/test desktop/vitest.config.ts desktop/docs/superpowers
```

Confirm no API, website, secrets, unrelated user changes, branch, staging, or commit was introduced. Report any pre-existing low-severity advisories separately instead of blocking completion.
