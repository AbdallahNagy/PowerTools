# FetchXML Builder Tool Refactor Design

## Goal

Replace the Metadata Explorer identity and folder with one self-contained FetchXML Builder tool while preserving its current behavior.

## Scope

- Rename the tool ID from `metadata-explorer` to `fetchxml-builder`.
- Rename the visible title to `FetchXML Builder`.
- Move tool-private code to `src/ui/tools/fetchxml-builder/`.
- Move tool-private tests beside the tool.
- Move shared Dataverse contracts, beginning with `EntityInfo`, to `src/ui/shared/contracts/`.
- Update the registry, shell tests, and Electron smoke test.

The refactor does not add the final `defineTool` runtime, reorganize other tools, change API or Electron behavior, or remove any FetchXML Builder capability.

## Target Structure

```text
src/ui/
├─ shared/
│  └─ contracts/
│     └─ dataverse.ts
└─ tools/
   ├─ registry.tsx
   └─ fetchxml-builder/
      ├─ index.tsx
      ├─ fetchxml-builder-icon.svg
      ├─ components/
      ├─ context/
      ├─ hooks/
      ├─ model/
      └─ tests/
```

The registry imports only the tool's public entry component. Other tools may not import FetchXML Builder internals. Shared UI stays in its existing shared location.

## Preserved Behavior

FetchXML Builder retains:

- connection and table selection;
- field and relationship loading;
- visual filter construction and validation;
- FetchXML generation and formatting;
- query execution, paging, and results;
- Dataverse record links and existing error handling;
- multiple independent tool instances.

The registry exposes ID `fetchxml-builder`, title `FetchXML Builder`, and tooltip `Build, run, and refine FetchXML queries`. Tabs are named `FetchXML Builder`, `FetchXML Builder 2`, and so on. The old `metadata-explorer` registry entry and compatibility alias are removed because tool IDs are not persisted.

## Ownership Rules

FetchXML Builder owns its screens, components, context, hooks, query workflow, FetchXML model, fixtures, and focused tests. Shell and smoke tests remain central because they verify application integration.

Backend concepts shared by multiple tools have one canonical contract under `shared/contracts/`. Moving `EntityInfo` there prevents Data Migration or future tools from depending on FetchXML Builder internals.

Direct Electron and API access remains behavior-compatible for this refactor. Moving those dependencies behind `platform/` and shared API modules remains Phase 1 work.

## Testing

- Preserve existing expected FetchXML, validation, lookup, relationship, result-summary, and record-URL outputs.
- Extend Vitest discovery to include colocated tool tests without importing them into the renderer bundle.
- Split the FetchXML Builder portion out of the mixed context contract test.
- Assert the exact new registry ID, title, tooltip, multiple-instance titles, and absence of the old registration.
- Update the Electron smoke test to open FetchXML Builder through the real activity bar.
- Run focused tests after each structural slice and finish with `npm run check` on Windows.

## Constraints

- Preserve production behavior except for the approved complete rename.
- Do not change request payloads, FetchXML semantics, paging, results, or errors.
- Do not introduce production credentials into tests.
- Keep changes small and reviewable.
- Do not create a branch, stage files, or commit changes.

## Success Criteria

- No production source or test imports `components/tools/MetadataExplorer`.
- No runtime registry entry uses `metadata-explorer` or the title `Metadata Explorer`.
- FetchXML Builder-specific code and tests live under its own tool folder.
- Shared contracts have a tool-neutral import path.
- `npm run check` passes, including the Windows Electron smoke test.
