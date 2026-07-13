# Lookup Record Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose lookup filter values from real Dataverse records instead of typing GUIDs.

**Architecture:** Reuse the existing FetchXML execute endpoint to load lookup target records. The filter tree continues storing GUID values for FetchXML, while optional label metadata is stored beside each condition for display only.

**Tech Stack:** React 19, TypeScript, TanStack Query, existing sidecar API client, Dataverse FetchXML.

## Global Constraints

- Keep generated FetchXML semantically unchanged: lookup condition values must remain record IDs.
- Follow existing MetadataExplorer component and styling patterns.
- Do not modify unrelated API changes already present in the worktree.
- Support multi-target lookups by letting the user switch target table inside the modal.

---

### Task 1: Lookup Selection State

**Files:**
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/model/types.ts`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/hooks/useFilterTree.ts`

**Interfaces:**
- Produces: `FilterCondition.valueLabels?: Record<string, string>` and `FilterCondition.lookupTarget?: string`

- [ ] Add optional display-only lookup fields to `FilterCondition`.
- [ ] Reset `valueLabels` and `lookupTarget` when the condition field changes.
- [ ] Clear `valueLabels` when the operator changes.

### Task 2: Lookup Fetch Hook

**Files:**
- Create: `desktop/src/ui/components/tools/MetadataExplorer/hooks/useLookupRecords.ts`

**Interfaces:**
- Consumes: `EntityInfo`, `connectionName`
- Produces: `LookupRecord { id: string; name: string }`

- [ ] Build a FetchXML request for the selected target table.
- [ ] Select primary ID and primary name attributes.
- [ ] Apply a `like` filter to the primary name when search text is present.
- [ ] Return displayable `{ id, name }` rows.

### Task 3: Lookup Picker Modal

**Files:**
- Create: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/LookupPickerModal.tsx`

**Interfaces:**
- Consumes: `field.targets`, all table metadata, selected target, current search text
- Produces: selected `{ id, name, target }`

- [ ] Show target table selector for lookup fields.
- [ ] Search within the selected target table.
- [ ] Render records in a compact table.
- [ ] On row select, return the selected record and close the modal.

### Task 4: Value Input Integration

**Files:**
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/ValueInput.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/ConditionNode.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/FilterTree.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/GroupNode.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/index.tsx`

**Interfaces:**
- Consumes: `connectionName`, `tables`, lookup condition labels
- Produces: lookup inputs with search icon and record-name display

- [ ] Pass connection and table metadata down to value inputs.
- [ ] For lookup fields, render a text input with a search icon button.
- [ ] Display selected record names when labels are available.
- [ ] For multi-value lookup operators, add selected records as chips while keeping ID arrays in state.

### Task 5: Verification

**Files:**
- Use existing project verification commands.

- [ ] Run `npm run build` from `desktop`.
- [ ] Review `git diff` to confirm only intended files changed.
