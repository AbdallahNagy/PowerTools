# Data Migration Single-Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 7-step Data Migration wizard with a single page holding all controls, with migration progress shown in a generic, tool-pluggable StatusBar.

**Architecture:** New flat component set under `src/ui/components/tools/DataMigration/` (header band with connections + mode + actions, entities panel left, fields panel right, Filter/Preview as modals). A new `StatusBarContext` lets any tool register status items rendered in the bottom blue StatusBar; Data Migration registers live job progress with an error popover. Backend loses the dead `MatchAttribute` field — the runner already matches records by GUID.

**Tech Stack:** React 19 + TypeScript + Tailwind 4 (Vite), TanStack React Query, Electron IPC via `window.electron`, ASP.NET Core 8 minimal API.

**Spec:** `docs/superpowers/specs/2026-06-13-data-migration-single-page-design.md`

**Testing note:** The desktop project has no JS test runner (no vitest/jest). Per-task verification is `npm run lint` + `npm run build` (run from `desktop/`), `dotnet build` for the API (run from `api/PowerTools/`), and a final manual verification task. Do not add a test framework.

**Paths:** All frontend paths relative to `desktop/`. All API paths relative to `api/PowerTools/`. Git repo root is `D:\dev\PowerTools` — commit paths include the `desktop/` / `api/` prefix.

---

### Task 1: Remove dead `MatchAttribute` from API

**Files:**
- Modify: `api/PowerTools/PowerTools.API/Tools/DataMigration/MigrationEndpoints.cs`
- Modify: `api/PowerTools/PowerTools.API/Services/IMigrationJobStore.cs`

`MigrationJobRunner.cs` never reads `MatchAttribute` (it builds `UpdateRequest`/`UpsertRequest` with the source record's GUID), so this is dead-code removal with no behavior change.

- [ ] **Step 1: Remove `MatchAttribute` from the request record**

In `MigrationEndpoints.cs`, change the record declaration:

```csharp
public record RunMigrationRequest(
    string EntityLogicalName,
    List<string> Attributes,
    string? FetchXmlFilter,
    string Mode);
```

- [ ] **Step 2: Remove the mapping line**

In the same file, in the `/run` handler, change the `MigrationJob` initializer so it ends:

```csharp
                EntityLogicalName = req.EntityLogicalName,
                Attributes = req.Attributes,
                FetchXmlFilter = req.FetchXmlFilter,
                Mode = req.Mode
            };
```

(Delete the `MatchAttribute = req.MatchAttribute` line; `Mode = req.Mode` loses its trailing comma.)

- [ ] **Step 3: Remove the property from `MigrationJob`**

In `IMigrationJobStore.cs`, delete this line from the `MigrationJob` class:

```csharp
    public string? MatchAttribute { get; init; }
```

- [ ] **Step 4: Verify no remaining references and build**

Run from repo root: `grep -ri "matchattribute" api/` — expected: no matches.
Run from `api/PowerTools/`: `dotnet build`
Expected: `Build succeeded. 0 Error(s)`

- [ ] **Step 5: Commit**

```bash
git add api/PowerTools/PowerTools.API/Tools/DataMigration/MigrationEndpoints.cs api/PowerTools/PowerTools.API/Services/IMigrationJobStore.cs
git commit -m "refactor(api): remove unused MatchAttribute from migration job"
```

---

### Task 2: StatusBarContext + generic StatusBar items

**Files:**
- Create: `desktop/src/ui/context/StatusBarContext.tsx`
- Modify: `desktop/src/ui/components/layout/Layout.tsx`
- Modify: `desktop/src/ui/components/layout/StatusBar.tsx`

- [ ] **Step 1: Create `StatusBarContext.tsx`**

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface StatusItem {
  id: string;
  content: ReactNode;
}

interface StatusBarContextType {
  items: StatusItem[];
  setStatus: (id: string, content: ReactNode) => void;
  clearStatus: (id: string) => void;
}

const StatusBarContext = createContext<StatusBarContextType | undefined>(
  undefined
);

export function StatusBarProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<StatusItem[]>([]);

  const setStatus = useCallback((id: string, content: ReactNode) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx === -1) return [...prev, { id, content }];
      const next = [...prev];
      next[idx] = { id, content };
      return next;
    });
  }, []);

  const clearStatus = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  return (
    <StatusBarContext.Provider value={{ items, setStatus, clearStatus }}>
      {children}
    </StatusBarContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStatusBar() {
  const ctx = useContext(StatusBarContext);
  if (!ctx)
    throw new Error("useStatusBar must be used within StatusBarProvider");
  return ctx;
}
```

(If `TabContext.tsx` exports its hook without the eslint-disable comment, drop the comment here too and match that file's style.)

- [ ] **Step 2: Wrap Layout in the provider**

Replace `desktop/src/ui/components/layout/Layout.tsx` content:

```tsx
import ActivityBar from './ActivityBar';
import TabBar from './TabBar';
import StatusBar from './StatusBar';
import { StatusBarProvider } from '../../context/StatusBarContext';

const Layout = () => {
  return (
    <StatusBarProvider>
      <div className="flex flex-col h-full w-full">
        <div className="flex-1 flex overflow-hidden">
          <ActivityBar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <TabBar />
          </div>
        </div>
        <StatusBar />
      </div>
    </StatusBarProvider>
  );
};

export default Layout;
```

- [ ] **Step 3: Render registered items in StatusBar**

In `desktop/src/ui/components/layout/StatusBar.tsx`:

Add import:

```tsx
import { useStatusBar } from "../../context/StatusBarContext";
```

Inside the component, after the existing state declarations, add:

```tsx
  const { items } = useStatusBar();
```

Replace the right-side block

```tsx
      <div className="flex items-center space-x-4">
        <span>v1.0.0</span>
      </div>
```

with:

```tsx
      <div className="flex items-center space-x-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-center">
            {item.content}
          </div>
        ))}
        <span>v1.0.0</span>
      </div>
```

- [ ] **Step 4: Verify**

Run from `desktop/`: `npm run lint && npm run build`
Expected: both succeed, no errors.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/ui/context/StatusBarContext.tsx desktop/src/ui/components/layout/Layout.tsx desktop/src/ui/components/layout/StatusBar.tsx
git commit -m "feat: generic status item host in StatusBar via StatusBarContext"
```

---

### Task 3: Generic Modal UI component

**Files:**
- Create: `desktop/src/ui/components/ui/Modal.tsx`

- [ ] **Step 1: Create `Modal.tsx`**

```tsx
import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  widthClass = "max-w-2xl",
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onMouseDown={onClose}
    >
      <div
        className={`bg-[#252526] border border-[#3c3c3c] rounded-sm shadow-xl w-full ${widthClass} max-h-[85vh] flex flex-col`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#3c3c3c]">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#858585] hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-auto flex-1 min-h-0 flex flex-col gap-4">
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run from `desktop/`: `npm run lint && npm run build`
Expected: pass. (`Modal` is unused until Task 6 — that's fine, exported module members don't trigger unused warnings.)

- [ ] **Step 3: Commit**

```bash
git add desktop/src/ui/components/ui/Modal.tsx
git commit -m "feat: generic Modal component"
```

---

### Task 4: ConnectionsBar (source/target dropdowns)

**Files:**
- Create: `desktop/src/ui/components/tools/DataMigration/ConnectionsBar.tsx`

- [ ] **Step 1: Create `ConnectionsBar.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { ConnectionInfo } from "../../../vite-env";

interface ConnectionsBarProps {
  sourceName: string;
  targetName: string;
  onSourceChange: (name: string) => void;
  onTargetChange: (name: string) => void;
}

export function ConnectionsBar({
  sourceName,
  targetName,
  onSourceChange,
  onTargetChange,
}: ConnectionsBarProps) {
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);

  useEffect(() => {
    window.electron.listConnections().then(setConnections);
    window.electron.onConnectionsUpdated(setConnections);
  }, []);

  return (
    <div className="flex items-end gap-3">
      <ConnectionSelect
        label="Source"
        value={sourceName}
        exclude={targetName}
        connections={connections}
        onChange={onSourceChange}
      />
      <span className="text-[#858585] pb-1.5">→</span>
      <ConnectionSelect
        label="Target"
        value={targetName}
        exclude={sourceName}
        connections={connections}
        onChange={onTargetChange}
      />
    </div>
  );
}

interface ConnectionSelectProps {
  label: string;
  value: string;
  exclude: string;
  connections: ConnectionInfo[];
  onChange: (name: string) => void;
}

function ConnectionSelect({
  label,
  value,
  exclude,
  connections,
  onChange,
}: ConnectionSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[#858585] uppercase tracking-wider">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#3c3c3c] border border-[#3c3c3c] text-[#cccccc] text-sm px-2 py-1.5 rounded-sm
                   focus:outline-none focus:border-[#007fd4] w-52"
      >
        <option value="">— select —</option>
        {connections.map((c) => (
          <option key={c.name} value={c.name} disabled={c.name === exclude}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run from `desktop/`: `npm run lint && npm run build` — expected: pass.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/ui/components/tools/DataMigration/ConnectionsBar.tsx
git commit -m "feat: ConnectionsBar source/target dropdowns for data migration"
```

---

### Task 5: EntityListPanel + FieldsPanel

**Files:**
- Create: `desktop/src/ui/components/tools/DataMigration/EntityListPanel.tsx`
- Create: `desktop/src/ui/components/tools/DataMigration/FieldsPanel.tsx`

- [ ] **Step 1: Create `EntityListPanel.tsx`**

```tsx
import { useState } from "react";
import { SearchInput } from "../../ui/SearchInput";
import { Spinner } from "../../ui/Spinner";
import { useEntities, type EntityInfo } from "../../../api/hooks/useEntities";

interface EntityListPanelProps {
  enabled: boolean;
  selected: EntityInfo | null;
  onSelect: (entity: EntityInfo) => void;
}

export function EntityListPanel({
  enabled,
  selected,
  onSelect,
}: EntityListPanelProps) {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useEntities(enabled);

  const filtered = (data ?? []).filter(
    (e) =>
      e.logicalName.toLowerCase().includes(search.toLowerCase()) ||
      e.displayName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex items-center justify-between gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search entities…"
        />
        <span className="text-xs text-[#858585] whitespace-nowrap">
          {filtered.length}
        </span>
      </div>

      {error && (
        <p className="text-sm text-[#f48771] bg-[#3c1e1e] border border-red-700 rounded-sm px-3 py-2">
          {(error as Error).message}
        </p>
      )}

      {!enabled ? (
        <p className="text-xs text-[#858585] italic mt-2">
          Select a source connection.
        </p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-[#858585] text-sm mt-2">
          <Spinner size={14} /> Loading entities…
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto border border-[#3c3c3c] rounded-sm">
          {filtered.map((e) => (
            <button
              key={e.logicalName}
              type="button"
              onClick={() => onSelect(e)}
              className={`w-full text-left px-3 py-1.5 border-b border-[#3c3c3c] last:border-0 transition-colors ${
                selected?.logicalName === e.logicalName
                  ? "bg-[#1e2530]"
                  : "hover:bg-[#2a2d2e]"
              }`}
            >
              <span className="text-sm text-[#cccccc] font-medium">
                {e.displayName}
              </span>
              <span className="ml-2 text-xs text-[#858585] font-mono">
                {e.logicalName}
              </span>
              {e.isCustom && (
                <span className="ml-2 text-xs px-1 py-0.5 rounded bg-[#1e2d3c] text-[#007fd4]">
                  Custom
                </span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-xs text-[#858585]">
              {search ? "No entities match your search." : "No entities found."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `FieldsPanel.tsx`**

Field selection is controlled by the parent (`selected` + `onChange`); the panel force-includes primary id attributes whenever metadata loads. Table styling ported from the old `AttributeSelectStep`.

```tsx
import { useEffect, useState } from "react";
import { Checkbox } from "../../ui/Checkbox";
import { SearchInput } from "../../ui/SearchInput";
import { Spinner } from "../../ui/Spinner";
import { useEntityAttributes } from "../../../api/hooks/useEntityAttributes";

interface FieldsPanelProps {
  entityLogicalName: string | null;
  selected: string[];
  onChange: (attributes: string[]) => void;
}

const reqColors: Record<string, string> = {
  SystemRequired: "bg-[#3c2020] text-[#f48771]",
  ApplicationRequired: "bg-[#3c2d20] text-[#e8a87c]",
  Recommended: "bg-[#1e2d1e] text-[#73c991]",
  None: "bg-[#2d2d2d] text-[#858585]",
};

export function FieldsPanel({
  entityLogicalName,
  selected,
  onChange,
}: FieldsPanelProps) {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useEntityAttributes(entityLogicalName);

  const usable = (data ?? []).filter(
    (a) => a.isValidForCreate || a.isValidForUpdate
  );

  const filtered = usable.filter(
    (a) =>
      a.logicalName.toLowerCase().includes(search.toLowerCase()) ||
      a.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const checked = new Set(selected);

  // Primary id attributes are always part of the selection.
  useEffect(() => {
    if (!data) return;
    const pks = data.filter((a) => a.isPrimaryId).map((a) => a.logicalName);
    const missing = pks.filter((pk) => !selected.includes(pk));
    if (missing.length > 0) onChange([...selected, ...missing]);
  }, [data, selected, onChange]);

  const toggle = (logicalName: string) => {
    if (checked.has(logicalName))
      onChange(selected.filter((a) => a !== logicalName));
    else onChange([...selected, logicalName]);
  };

  const selectAll = () => onChange(usable.map((a) => a.logicalName));
  const selectNone = () =>
    onChange(
      (data ?? []).filter((a) => a.isPrimaryId).map((a) => a.logicalName)
    );

  if (!entityLogicalName) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[#858585] border border-dashed border-[#3c3c3c] rounded-sm">
        Select an entity to see its fields.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex items-center justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search fields…"
        />
        <div className="flex items-center gap-3 ml-4">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-[#007fd4] hover:underline whitespace-nowrap"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={selectNone}
            className="text-xs text-[#858585] hover:text-white whitespace-nowrap"
          >
            Select none
          </button>
          <span className="text-xs text-[#858585] whitespace-nowrap">
            {selected.length} selected
          </span>
        </div>
      </div>

      {error && (
        <p className="text-sm text-[#f48771] bg-[#3c1e1e] border border-red-700 rounded-sm px-3 py-2">
          {(error as Error).message}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-[#858585] text-sm mt-2">
          <Spinner size={14} /> Loading attributes…
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto border border-[#3c3c3c] rounded-sm">
          <table className="w-full text-sm">
            <thead className="bg-[#252526] sticky top-0">
              <tr>
                <th className="w-10 px-3 py-2" />
                <th className="text-left px-3 py-2 text-xs font-medium text-[#858585] uppercase">
                  Display Name
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-[#858585] uppercase">
                  Logical Name
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-[#858585] uppercase">
                  Type
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-[#858585] uppercase">
                  Required
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((attr) => {
                const isLocked = attr.isPrimaryId;
                const isChecked = checked.has(attr.logicalName);
                return (
                  <tr
                    key={attr.logicalName}
                    onClick={() => !isLocked && toggle(attr.logicalName)}
                    className={`border-b border-[#3c3c3c] last:border-0 transition-colors ${
                      isLocked
                        ? "opacity-60"
                        : "cursor-pointer hover:bg-[#2a2d2e]"
                    } ${isChecked ? "bg-[#1e2530]" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={isChecked}
                        onChange={() => !isLocked && toggle(attr.logicalName)}
                        disabled={isLocked}
                      />
                    </td>
                    <td className="px-3 py-2 text-[#cccccc] font-medium">
                      {attr.displayName}
                    </td>
                    <td className="px-3 py-2 text-[#858585] font-mono text-xs">
                      {attr.logicalName}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs bg-[#2d2d2d] text-[#858585] px-1.5 py-0.5 rounded">
                        {attr.attributeType}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${reqColors[attr.requiredLevel] ?? reqColors.None}`}
                      >
                        {attr.requiredLevel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run from `desktop/`: `npm run lint && npm run build` — expected: pass.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/ui/components/tools/DataMigration/EntityListPanel.tsx desktop/src/ui/components/tools/DataMigration/FieldsPanel.tsx
git commit -m "feat: entity and field selection panels for single-page data migration"
```

---

### Task 6: FilterModal + PreviewModal

**Files:**
- Create: `desktop/src/ui/components/tools/DataMigration/FilterModal.tsx`
- Create: `desktop/src/ui/components/tools/DataMigration/PreviewModal.tsx`

- [ ] **Step 1: Create `FilterModal.tsx`** (validation + composed preview ported from old `FilterStep`)

```tsx
import { useEffect, useState } from "react";
import { Modal } from "../../ui/Modal";
import { Button } from "../../ui/Button";

interface FilterModalProps {
  open: boolean;
  onClose: () => void;
  entityLogicalName: string;
  selectedAttributes: string[];
  value: string;
  onApply: (filter: string) => void;
}

export function FilterModal({
  open,
  onClose,
  entityLogicalName,
  selectedAttributes,
  value,
  onApply,
}: FilterModalProps) {
  const [draft, setDraft] = useState(value);
  const [xmlError, setXmlError] = useState<string | null>(null);

  // Re-sync the draft each time the modal opens.
  useEffect(() => {
    if (open) {
      setDraft(value);
      setXmlError(null);
    }
  }, [open, value]);

  const validate = (val: string): boolean => {
    if (!val.trim()) {
      setXmlError(null);
      return true;
    }
    const doc = new DOMParser().parseFromString(
      `<root>${val}</root>`,
      "application/xml"
    );
    const err = doc.querySelector("parsererror");
    if (err) {
      setXmlError(err.textContent ?? "Invalid XML");
      return false;
    }
    setXmlError(null);
    return true;
  };

  const handleChange = (val: string) => {
    setDraft(val);
    if (xmlError) validate(val);
  };

  const handleApply = () => {
    if (validate(draft)) onApply(draft);
  };

  const composed = buildFetchXmlPreview(
    entityLogicalName,
    selectedAttributes,
    draft
  );

  return (
    <Modal open={open} onClose={onClose} title="FetchXML Filter">
      <div>
        <label className="text-xs text-[#858585] uppercase tracking-wider block mb-1.5">
          Filter <span className="normal-case text-[#555]">(optional)</span>
        </label>
        <textarea
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={`<filter>\n  <condition attribute="statecode" operator="eq" value="0" />\n</filter>`}
          spellCheck={false}
          className="w-full h-32 font-mono text-xs bg-[#1e1e1e] border border-[#3c3c3c] text-[#cccccc]
                     rounded-sm p-3 resize-none focus:outline-none focus:border-[#007fd4]
                     placeholder-[#555]"
        />
        {xmlError && <p className="text-xs text-[#f48771] mt-1">{xmlError}</p>}
        <p className="text-xs text-[#858585] mt-1">
          Enter only the{" "}
          <code className="text-[#cccccc]">&lt;filter&gt;</code> element. Leave
          blank to migrate all records.
        </p>
      </div>

      <div>
        <p className="text-xs text-[#858585] uppercase tracking-wider mb-1.5">
          Composed FetchXML
        </p>
        <pre className="text-xs font-mono bg-[#1e1e1e] border border-[#3c3c3c] rounded-sm p-3 overflow-auto max-h-40 text-[#858585] whitespace-pre-wrap">
          {composed}
        </pre>
      </div>

      <div className="flex justify-between pt-1">
        <Button variant="secondary" onClick={() => onApply("")}>
          Clear filter
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply</Button>
        </div>
      </div>
    </Modal>
  );
}

function buildFetchXmlPreview(
  entity: string,
  attrs: string[],
  filter: string
): string {
  const attrLines = attrs.map((a) => `  <attribute name="${a}" />`).join("\n");
  const filterBlock = filter.trim() ? `\n  ${filter.trim()}` : "";
  return `<fetch>\n  <entity name="${entity}">\n${attrLines}${filterBlock}\n  </entity>\n</fetch>`;
}
```

- [ ] **Step 2: Create `PreviewModal.tsx`** (table + paging ported from old `PreviewStep`; query only runs while open)

```tsx
import { useEffect, useState } from "react";
import { Modal } from "../../ui/Modal";
import { Spinner } from "../../ui/Spinner";
import { usePreviewRecords } from "../../../api/hooks/usePreviewRecords";

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  entityLogicalName: string;
  attributes: string[];
  fetchXmlFilter: string;
}

const PAGE_SIZE = 50;

export function PreviewModal({
  open,
  onClose,
  entityLogicalName,
  attributes,
  fetchXmlFilter,
}: PreviewModalProps) {
  const [page, setPage] = useState(1);
  const [pagingCookieStack, setPagingCookieStack] = useState<
    (string | null)[]
  >([null]);

  // Reset paging each time the modal opens.
  useEffect(() => {
    if (open) {
      setPage(1);
      setPagingCookieStack([null]);
    }
  }, [open]);

  const currentCookie = pagingCookieStack[page - 1] ?? undefined;

  const { data, isLoading, error } = usePreviewRecords(
    open
      ? {
          entityLogicalName,
          attributes,
          fetchXmlFilter: fetchXmlFilter || undefined,
          pageSize: PAGE_SIZE,
          pagingCookie: currentCookie,
          page,
        }
      : null
  );

  const goNext = () => {
    if (!data?.pagingCookie) return;
    setPagingCookieStack((prev) => [...prev, data.pagingCookie]);
    setPage((p) => p + 1);
  };

  const goPrev = () => {
    if (page <= 1) return;
    setPagingCookieStack((prev) => prev.slice(0, -1));
    setPage((p) => p - 1);
  };

  const displayAttrs = attributes
    .filter((a) => !a.endsWith("id") || a === attributes[0])
    .slice(0, 8);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Preview — ${entityLogicalName}`}
      widthClass="max-w-4xl"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#858585]">
          {data?.totalEstimate != null
            ? `Showing page ${page} · ~${data.totalEstimate.toLocaleString()} total records`
            : `Page ${page}`}
        </p>
        {isLoading && <Spinner size={14} />}
      </div>

      {error && (
        <p className="text-sm text-[#f48771] bg-[#3c1e1e] border border-red-700 rounded-sm px-3 py-2">
          {(error as Error).message}
        </p>
      )}

      <div className="flex-1 min-h-48 overflow-auto border border-[#3c3c3c] rounded-sm">
        <table className="w-full text-sm text-[#cccccc] border-collapse">
          <thead className="bg-[#252526] sticky top-0">
            <tr>
              {displayAttrs.map((a) => (
                <th
                  key={a}
                  className="text-left px-3 py-2 text-xs font-medium text-[#858585] uppercase border-b border-[#3c3c3c]"
                >
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.records ?? []).map((row, i) => (
              <tr
                key={i}
                className="border-b border-[#3c3c3c] last:border-0 hover:bg-[#2a2d2e]"
              >
                {displayAttrs.map((a) => (
                  <td
                    key={a}
                    className="px-3 py-2 text-xs text-[#cccccc] max-w-[200px] truncate"
                  >
                    {String(row[a] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
            {!isLoading && (data?.records ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={displayAttrs.length}
                  className="px-3 py-6 text-center text-[#858585] text-xs"
                >
                  No records found matching the filter criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={goPrev}
          disabled={page <= 1 || isLoading}
          className="text-xs text-[#858585] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Prev
        </button>
        <span className="text-xs text-[#858585]">Page {page}</span>
        <button
          type="button"
          onClick={goNext}
          disabled={!data?.moreRecords || isLoading}
          className="text-xs text-[#858585] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Verify**

Run from `desktop/`: `npm run lint && npm run build` — expected: pass.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/ui/components/tools/DataMigration/FilterModal.tsx desktop/src/ui/components/tools/DataMigration/PreviewModal.tsx
git commit -m "feat: filter and preview modals for single-page data migration"
```

---

### Task 7: MigrationOptions + MigrationStatusItem

**Files:**
- Create: `desktop/src/ui/components/tools/DataMigration/MigrationOptions.tsx`
- Create: `desktop/src/ui/components/tools/DataMigration/MigrationStatusItem.tsx`

- [ ] **Step 1: Create `MigrationOptions.tsx`**

`MigrationMode` moves here from the old `SettingsStep` (which gets deleted in Task 8).

```tsx
import { Checkbox } from "../../ui/Checkbox";
import { Button } from "../../ui/Button";
import { Spinner } from "../../ui/Spinner";

export type MigrationMode = "create" | "update" | "upsert";

interface MigrationOptionsProps {
  doCreate: boolean;
  doUpdate: boolean;
  onCreateChange: (v: boolean) => void;
  onUpdateChange: (v: boolean) => void;
  hasFilter: boolean;
  filterDisabled: boolean;
  onOpenFilter: () => void;
  previewDisabled: boolean;
  onOpenPreview: () => void;
  startDisabled: boolean;
  isStarting: boolean;
  onStart: () => void;
}

export function MigrationOptions({
  doCreate,
  doUpdate,
  onCreateChange,
  onUpdateChange,
  hasFilter,
  filterDisabled,
  onOpenFilter,
  previewDisabled,
  onOpenPreview,
  startDisabled,
  isStarting,
  onStart,
}: MigrationOptionsProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div
        className="flex items-center gap-4"
        title="Create: new records are created in the target. Update: records that already exist in the target (same id) are overwritten with source values. Both: upsert."
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={doCreate} onChange={onCreateChange} />
          <span className="text-sm text-[#cccccc]">Create</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={doUpdate} onChange={onUpdateChange} />
          <span className="text-sm text-[#cccccc]">Update</span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={onOpenFilter}
          disabled={filterDisabled}
        >
          Filter{hasFilter && <span className="ml-1 text-[#007fd4]">●</span>}
        </Button>
        <Button
          variant="secondary"
          onClick={onOpenPreview}
          disabled={previewDisabled}
        >
          Preview
        </Button>
        <Button onClick={onStart} disabled={startDisabled}>
          {isStarting ? (
            <>
              <Spinner size={14} />
              &nbsp;Starting…
            </>
          ) : (
            "▶ Start Migration"
          )}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `MigrationStatusItem.tsx`** (rendered inside the StatusBar; popover pattern copied from StatusBar's connection popover, but anchored right)

```tsx
import { useEffect, useRef, useState } from "react";
import type { MigrationJobStatus } from "../../../api/hooks/useMigrationJob";

interface MigrationStatusItemProps {
  entityLogicalName: string;
  job: MigrationJobStatus;
}

export function MigrationStatusItem({
  entityLogicalName,
  job,
}: MigrationStatusItemProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const running = job.status === "queued" || job.status === "running";
  const label = running
    ? `⟳ ${entityLogicalName} ${job.processed}/${job.total || "?"} ✓${job.succeeded} ✗${job.failed}`
    : job.failed > 0
      ? `⚠ ${entityLogicalName}: ${job.succeeded} ok, ${job.failed} failed`
      : `✓ ${entityLogicalName}: ${job.succeeded} migrated`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-white/15 px-1 rounded cursor-pointer"
      >
        {label}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1 w-96 max-h-64 overflow-auto bg-[#252526] text-[#cccccc] border border-black/40 rounded shadow-lg z-50">
          <div className="px-3 py-1.5 text-xs border-b border-black/40">
            {job.processed}/{job.total || "?"} processed · {job.succeeded}{" "}
            succeeded · {job.failed} failed
          </div>
          {job.errors.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[#858585]">No errors.</div>
          ) : (
            job.errors.map((e, i) => (
              <div
                key={i}
                className="px-3 py-2 border-b border-black/20 last:border-0"
              >
                <p className="text-xs text-[#858585]">
                  Record:{" "}
                  <span className="text-[#cccccc] font-mono">{e.recordId}</span>
                </p>
                <p className="text-xs text-[#f48771] mt-0.5">{e.message}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run from `desktop/`: `npm run lint && npm run build` — expected: pass.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/ui/components/tools/DataMigration/MigrationOptions.tsx desktop/src/ui/components/tools/DataMigration/MigrationStatusItem.tsx
git commit -m "feat: migration options bar and status bar progress item"
```

---

### Task 8: Rewire index.tsx, delete wizard, drop matchAttribute from hook

**Files:**
- Modify: `desktop/src/ui/components/tools/DataMigration/index.tsx` (full rewrite)
- Modify: `desktop/src/ui/api/hooks/useMigrationJob.ts`
- Delete: `desktop/src/ui/components/tools/DataMigration/steps/` (entire folder, 7 files)
- Delete: `desktop/src/ui/components/ui/Stepper.tsx` (only consumer was the wizard — verify in Step 4)

- [ ] **Step 1: Remove `matchAttribute` from `useMigrationJob.ts`**

In `RunMigrationArgs`, delete the line:

```ts
  matchAttribute?: string;
```

(Nothing else in the file changes; the spread in `useStartMigration` already excludes only `targetConnectionName`.)

- [ ] **Step 2: Rewrite `index.tsx`**

Replace the entire file with:

```tsx
import { useEffect, useState } from "react";
import { ToastProvider, useToast } from "../../ui/Toast";
import { useStatusBar } from "../../../context/StatusBarContext";
import { ConnectionsBar } from "./ConnectionsBar";
import { MigrationOptions, type MigrationMode } from "./MigrationOptions";
import { EntityListPanel } from "./EntityListPanel";
import { FieldsPanel } from "./FieldsPanel";
import { FilterModal } from "./FilterModal";
import { PreviewModal } from "./PreviewModal";
import { MigrationStatusItem } from "./MigrationStatusItem";
import {
  useStartMigration,
  useMigrationJob,
} from "../../../api/hooks/useMigrationJob";
import type { EntityInfo } from "../../../api/hooks/useEntities";

export default function DataMigration() {
  return (
    <ToastProvider>
      <DataMigrationPage />
    </ToastProvider>
  );
}

function DataMigrationPage() {
  const [sourceName, setSourceName] = useState("");
  const [targetName, setTargetName] = useState("");
  const [entity, setEntity] = useState<EntityInfo | null>(null);
  const [attributes, setAttributes] = useState<string[]>([]);
  const [fetchFilter, setFetchFilter] = useState("");
  const [doCreate, setDoCreate] = useState(true);
  const [doUpdate, setDoUpdate] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [runningEntity, setRunningEntity] = useState("");

  const { showToast } = useToast();
  const { setStatus, clearStatus } = useStatusBar();
  const { mutate: startMigration, isPending } = useStartMigration();
  const { data: job } = useMigrationJob(jobId);

  // Autofill source from the active connection on first open.
  useEffect(() => {
    window.electron.getActiveConnection().then((res) => {
      if ("name" in res) setSourceName((prev) => prev || res.name);
    });
  }, []);

  // Metadata hooks authenticate as the active connection; keep it in
  // sync with the chosen source so entities/fields come from the right org.
  const changeSource = async (name: string) => {
    setSourceName(name);
    setEntity(null);
    setAttributes([]);
    setFetchFilter("");
    if (name) await window.electron.setActiveConnection(name);
  };

  const selectEntity = (e: EntityInfo) => {
    setEntity(e);
    setAttributes([]);
    setFetchFilter("");
  };

  // Mirror job progress into the status bar.
  useEffect(() => {
    if (!job) return;
    setStatus(
      "data-migration",
      <MigrationStatusItem entityLogicalName={runningEntity} job={job} />
    );
  }, [job, runningEntity, setStatus]);

  useEffect(() => () => clearStatus("data-migration"), [clearStatus]);

  const mode: MigrationMode =
    doCreate && doUpdate ? "upsert" : doUpdate ? "update" : "create";
  const isRunning = job?.status === "queued" || job?.status === "running";
  const canStart =
    !!sourceName &&
    !!targetName &&
    sourceName !== targetName &&
    !!entity &&
    attributes.length > 0 &&
    (doCreate || doUpdate) &&
    !isPending &&
    !isRunning;

  const handleStart = () => {
    if (!entity) return;
    startMigration(
      {
        entityLogicalName: entity.logicalName,
        attributes,
        fetchXmlFilter: fetchFilter || undefined,
        mode,
        targetConnectionName: targetName,
      },
      {
        onSuccess: (res) => {
          setRunningEntity(entity.logicalName);
          setJobId(res.jobId);
        },
        onError: (err) => showToast((err as Error).message, "error"),
      }
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 gap-4 text-[#cccccc] overflow-hidden">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <ConnectionsBar
          sourceName={sourceName}
          targetName={targetName}
          onSourceChange={changeSource}
          onTargetChange={setTargetName}
        />
        <MigrationOptions
          doCreate={doCreate}
          doUpdate={doUpdate}
          onCreateChange={setDoCreate}
          onUpdateChange={setDoUpdate}
          hasFilter={!!fetchFilter.trim()}
          filterDisabled={!entity}
          onOpenFilter={() => setFilterOpen(true)}
          previewDisabled={!entity || attributes.length === 0}
          onOpenPreview={() => setPreviewOpen(true)}
          startDisabled={!canStart}
          isStarting={isPending}
          onStart={handleStart}
        />
      </div>

      <div className="flex flex-1 min-h-0 gap-4">
        <div className="w-1/3 min-w-64 flex flex-col min-h-0">
          <EntityListPanel
            enabled={!!sourceName}
            selected={entity}
            onSelect={selectEntity}
          />
        </div>
        <div className="flex-1 flex flex-col min-h-0">
          <FieldsPanel
            entityLogicalName={entity?.logicalName ?? null}
            selected={attributes}
            onChange={setAttributes}
          />
        </div>
      </div>

      {entity && (
        <FilterModal
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          entityLogicalName={entity.logicalName}
          selectedAttributes={attributes}
          value={fetchFilter}
          onApply={(f) => {
            setFetchFilter(f);
            setFilterOpen(false);
          }}
        />
      )}

      {entity && (
        <PreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          entityLogicalName={entity.logicalName}
          attributes={attributes}
          fetchXmlFilter={fetchFilter}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Delete the wizard steps folder**

```bash
git rm -r desktop/src/ui/components/tools/DataMigration/steps
```

- [ ] **Step 4: Verify Stepper has no remaining consumers, then delete it**

Run from `desktop/`: `grep -ri "Stepper" src/` — expected: only `src/ui/components/ui/Stepper.tsx` itself. If anything else imports it, keep the file and skip the deletion.

```bash
git rm desktop/src/ui/components/ui/Stepper.tsx
```

- [ ] **Step 5: Verify**

Run from `desktop/`: `npm run lint && npm run build`
Expected: both pass. Build failures here most likely mean a leftover import of `steps/` or `Stepper` — fix the import, don't restore the files.

- [ ] **Step 6: Commit**

```bash
git add -A desktop/src/ui
git commit -m "feat: single-page data migration tool replacing step wizard"
```

---

### Task 9: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start both apps**

Terminal 1, from `api/PowerTools/`: `dotnet run --project PowerTools.API`
Terminal 2, from `desktop/`: `npm run dev`

- [ ] **Step 2: Verify against the spec checklist**

With two saved connections:

1. Open Data Migration tab — source dropdown autofilled with the active connection; entities list loads.
2. Change source — entities reload from the new org; entity/field selection resets; the StatusBar connection label switches (expected: source change sets the active connection).
3. Select an entity — fields appear right; primary id checked and locked; select all / none works.
4. Filter button disabled until entity selected; opens modal; invalid XML shows parse error and blocks Apply; applying shows the blue ● badge; Clear removes it.
5. Preview disabled until entity + ≥1 field; opens modal with records and paging.
6. Start disabled until source+target+entity+fields+mode valid and source ≠ target.
7. Start a migration — progress appears in the bottom blue StatusBar (`⟳ entity n/total ✓ ✗`), page stays interactive, Start stays disabled while running.
8. Click the status item — popover lists errors (or "No errors.").
9. Finish — status flips to `✓ ... migrated` or `⚠ ... failed`; verify created/updated records in the target org for each mode (create-only, update-only, both = upsert).

- [ ] **Step 3: Report results**

If any check fails, fix before declaring done (use superpowers:systematic-debugging for non-obvious failures).
