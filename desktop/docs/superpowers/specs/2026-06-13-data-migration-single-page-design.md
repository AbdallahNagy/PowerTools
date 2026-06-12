# Data Migration — Single-Page Redesign

**Date:** 2026-06-13
**Status:** Approved design, pending implementation plan

## Goal

Replace the 7-step Data Migration wizard with one page holding all controls. Developers migrate many entities repeatedly; the wizard's forced sequence slows them down. Everything visible and editable at once, one entity per run.

## Layout

```
┌────────────────────────────────────────────────────────────────┐
│ Source [▼ Dev   ] Target [▼ Prod  ] │ ☑Create ☐Update         │
│                                     │ [Filter] [Preview] [▶ Start] │
├──────────────────────┬─────────────────────────────────────────┤
│ 🔍 Search entities   │ 🔍 Search fields   [all][none]  12 sel  │
│  Account             │  ☑ name                                 │
│  Contact ◀           │  ☑ emailaddress1                        │
│  Lead                │  ☐ telephone1                           │
│  ...                 │  ...                                    │
└──────────────────────┴─────────────────────────────────────────┘
(StatusBar, bottom blue line: ⟳ contact 450/1200 ✓430 ✗20)
```

## Components

```
src/ui/components/tools/DataMigration/
  index.tsx            — state owner, layout grid
  ConnectionsBar.tsx   — source/target dropdowns
  MigrationOptions.tsx — mode checkboxes + Filter/Preview/Start buttons
  EntityListPanel.tsx  — left panel: search + entity list
  FieldsPanel.tsx      — right panel: search + select all/none + field checkbox table
  FilterModal.tsx      — multiline FetchXML textarea, clear button
  PreviewModal.tsx     — sample records table
```

The `steps/` folder and `Stepper` usage are deleted.

### Header band

- **Source / Target dropdowns** — saved connections from `window.electron.listConnections()`, live-updated via `onConnectionsUpdated`. Source autofills from `getActiveConnection()` on mount. No "create new connection" entry point here. Validation: both required, source ≠ target.
- **Mode** — Create / Update checkboxes. Both checked = upsert (existing `SettingsStep` logic). Update/upsert match records by primary id (GUID); there is **no match attribute**.
- **[Filter]** — opens `FilterModal` with multiline FetchXML textarea. Button shows badge dot when a filter is set.
- **[Preview]** — opens `PreviewModal` with sample records (`usePreviewRecords`). Disabled until entity + ≥1 field selected.
- **[▶ Start]** — disabled until: source, target, entity, ≥1 field, ≥1 mode checkbox; also disabled while a job is running.

### Left panel — entities

Search box + entity list from `useEntities` against the source connection. Selecting an entity loads its fields and resets the field selection.

### Right panel — fields

Search, select all / select none, checkbox table with type/required badges (ported from `AttributeSelectStep`). Primary id always checked and locked. Empty state when no entity selected.

### Source connection switching

`useEntities` / `useEntityAttributes` send the **active** connection's token. When the source dropdown changes, call `window.electron.setActiveConnection(name)` so metadata queries hit the chosen source environment. No API change.

## StatusBar — generic status host

New `src/ui/context/StatusBarContext.tsx`:

```ts
interface StatusBarApi {
  setStatus(id: string, content: ReactNode): void;
  clearStatus(id: string): void;
}
```

- Provider wraps the app shell. `StatusBar` keeps the connection button on the left and renders registered status items on the right (before the version label), keyed by id so multiple tools coexist.
- Data Migration registers `id: "data-migration"`:
  - running: `⟳ contact 450/1200 ✓430 ✗20`
  - done: `✓ contact done` or `⚠ 20 errors`
  - cleared on unmount / new run reset.
- Clicking the status item opens a popover above the bar with the error list (same interaction pattern as the connection popover). Job state comes from `useMigrationJob` polling.
- Page stays interactive during a run; user can prepare the next entity while one migrates.

## Backend changes

Remove dead `MatchAttribute`:

- `MigrationEndpoints.cs` — drop from `MigrationStartRequest` and job mapping.
- `IMigrationJobStore.cs` — drop `MatchAttribute` property from `MigrationJob`.

`MigrationJobRunner` already matches by `source.Id` and never reads `MatchAttribute`; behavior is unchanged.

## Error handling

- Entity/field load failures: inline banner inside the respective panel (existing pattern).
- Start failure: toast (existing `ToastProvider`).
- Per-record migration errors: status bar popover.

## Out of scope

- Multi-entity batch migration (one entity per run, as today).
- Creating connections from this page.
- Preview pagination or editing.

## Testing

- `npm run lint` and `npm run build` must pass.
- Manual verification: run API + desktop, migrate an entity between two saved connections; verify mode combinations (create / update / upsert), filter badge, preview modal, status bar progress + error popover.
