# Relationship Scope Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flattened related-field paths with explicit, recursively nested lookup relationship scopes.

**Architecture:** Add `FilterRelationship` as a filter-tree node that owns a normal child group. Render it as an inner FetchXML `link-entity`, and let each scope use the existing condition/group UI with metadata for its target table. The field picker lists local fields and local many-to-one lookup relationships but never recursively expands inside the picker.

**Tech Stack:** React 19, TypeScript, TanStack Query, Node test runner, existing FetchXML renderer.

## Global Constraints

- Selecting a relationship implies positive existence; do not display `contains data`.
- Do not implement `does not contain data`.
- List only many-to-one lookup relationships.
- Support recursively nested relationship scopes without a fixed depth.
- Preserve existing root filters and legacy path-based condition rendering.
- Leave all changes uncommitted.

---

### Task 1: Relationship Tree Model and FetchXML

**Files:**
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/model/types.ts`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/model/fetchxml.ts`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/model/validation.ts`
- Test: `desktop/test/fetchxmlRelationship.test.mjs`

**Interfaces:**
- Produces: `FilterRelationship`
- Produces: explicit relationship-node rendering in `buildFetchXml`
- Produces: `selectLookupRelationships(relationships)`

- [ ] Add a failing test where a `relationship` node containing a `name` condition renders an inner `link-entity`.
- [ ] Run `node --test test/fetchxmlRelationship.test.mjs`; expect failure because relationship nodes are not rendered.
- [ ] Add `FilterRelationship` to `FilterNode`.
- [ ] Render relationship-owned groups and recursively nested relationships.
- [ ] Add a failing test that one-to-many metadata is removed by `selectLookupRelationships`.
- [ ] Implement `selectLookupRelationships` as a many-to-one filter.
- [ ] Add validation coverage for relationship nodes under OR parents.
- [ ] Run the focused test and expect all relationship tests to pass.

### Task 2: Tree Actions

**Files:**
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/hooks/useFilterTree.ts`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/DragContext.tsx`

**Interfaces:**
- Produces: `replaceConditionWithRelationship(id, relationship)`
- Consumes: `FilterRelationship.group` as a recursive tree container

- [ ] Add a pure reducer test surface or testable helper for replacing a condition in place.
- [ ] Run the focused test and verify replacement fails before implementation.
- [ ] Create a relationship node with one blank condition and an AND child group.
- [ ] Recurse through relationship-owned groups for find, update, remove, duplicate, move, and drag-cycle checks.
- [ ] Run focused tests and TypeScript build.

### Task 3: Relationship Scope UI

**Files:**
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/FieldPicker.tsx`
- Delete: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/FieldPickerBranch.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/ConditionNode.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/GroupNode.tsx`
- Create: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/RelationshipNode.tsx`

**Interfaces:**
- `FieldPicker.onSelectRelationship(relationship)`
- `RelationshipNode` loads target fields and relationships and renders its child group

- [ ] Replace the recursive picker tree with a fields-first select containing a `Related tables` option group.
- [ ] Filter relationship options through `selectLookupRelationships`.
- [ ] Replace the selected condition with a relationship node.
- [ ] Render a compact relationship header and an indented child group.
- [ ] Load target fields and relationships lazily within `RelationshipNode`.
- [ ] Pass the accumulated path to nested scopes for deterministic aliases.
- [ ] Keep remove, duplicate, move, field operator, and value behavior unchanged.

### Task 4: Verification

**Files:**
- Review all changed relationship-filter files.

**Interfaces:**
- Produces: verified uncommitted working tree

- [ ] Run `npm test` from `desktop`; expect zero failures.
- [ ] Run `npm run lint` from `desktop`; expect zero errors.
- [ ] Run `npm run build` from `desktop`; expect exit code 0.
- [ ] Run `dotnet test api\PowerTools\PowerTools.sln`; expect exit code 0.
- [ ] Inspect `git diff --stat` and `git status --short`.
- [ ] Do not stage or commit.
