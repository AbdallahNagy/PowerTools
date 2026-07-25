# Relationship Filters Implementation Plan

> Superseded by `2026-07-25-relationship-scope-filters.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Fetch Builder users filter records by fields on related Dataverse tables, including regarding/polymorphic lookup targets.

**Architecture:** Keep the relationship metadata endpoint and tested FetchXML path model, but replace the modal path browser with an anchored recursive field tree. Each expanded related table lazily loads its own fields and relationships and uses the same fields-first, related-tables-second layout.

**Tech Stack:** ASP.NET Core minimal APIs, Microsoft Dataverse SDK metadata, React 19, TypeScript, TanStack Query, existing Node test runner.

## Global Constraints

- Preserve existing root-field filter behavior and generated FetchXML.
- Support many-to-one lookup paths and one-to-many child relationship paths.
- Support polymorphic lookup targets by letting the user choose a concrete target table.
- Allow user-driven recursive relationship navigation without a fixed depth.
- Reject mixed-scope `or` groups that cannot be represented safely.
- Do not implement many-to-many relationships, outer joins, related result columns, or FetchXML import.

---

### Task 1: Relationship Metadata API

**Files:**
- Modify: `api/PowerTools/PowerTools.API/Tools/Metadata/MetadataEndpoints.cs`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/model/types.ts`
- Create: `desktop/src/ui/components/tools/MetadataExplorer/hooks/useEntityRelationships.ts`

**Interfaces:**
- Produces: `RelationshipMetadata`, `useEntityRelationships(logicalName, connectionName)`

- [ ] Add `RelationshipMetadata` and `RelationshipType` TypeScript types.
- [ ] Add `GET /api/metadata/entities/{logicalName}/relationships` returning compact many-to-one and one-to-many metadata.
- [ ] Add `useEntityRelationships` using query key `["metadata", "relationships", connectionName, logicalName]`.
- [ ] Run `npm run build` after the renderer compiles with the new hook.

### Task 2: Field References and FetchXML Rendering

**Files:**
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/model/types.ts`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/model/fetchxml.ts`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/model/validation.ts`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/hooks/useFilterTree.ts`
- Create: `desktop/test/fetchxmlRelationship.test.mjs`

**Interfaces:**
- Produces: `FieldReference`, `RelationshipPathSegment`, deterministic related FetchXML rendering.

- [ ] Write failing tests for root compatibility, one-hop many-to-one joins, one-to-many joins, shared joins, nested joins, and invalid mixed-scope `or`.
- [ ] Migrate conditions from `field` to `fieldRef` while keeping a compatibility helper for current UI calls.
- [ ] Render root conditions exactly as before.
- [ ] Render related path conditions under `link-entity` nodes using stored `linkFromAttribute` and `linkToAttribute`.
- [ ] Add validation for missing field references and mixed-scope `or` groups.
- [ ] Run `npm test -- fetchxmlRelationship.test.mjs` and existing FetchXML tests.

### Task 3: Recursive Advanced Find Field Picker

**Files:**
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/FieldPicker.tsx`
- Delete: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/RelatedFieldPickerModal.tsx`
- Create: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/FieldPickerBranch.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/ConditionNode.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/GroupNode.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/FilterTree.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/index.tsx`

**Interfaces:**
- Consumes: `RelationshipMetadata[]`, `EntityInfo[]`, `useTableMetadata`, `fieldRef`
- Produces: condition rows that can select root fields or related field paths.

- [ ] Pass connection name and tables into the filter builder.
- [ ] Replace the native field select and modal with an anchored custom dropdown.
- [ ] Render the root table's fields first and related tables below them.
- [ ] Expand related tables inline with one indentation level per relationship hop.
- [ ] Lazily load fields and relationships for every expanded table.
- [ ] Support arbitrary user-driven depth, including cyclic relationships.
- [ ] Close the dropdown after field selection, outside click, or Escape.
- [ ] Resolve final field metadata for `OperatorPicker` and `ValueInput`.
- [ ] Reset operator/value state when `fieldRef` changes.
- [ ] Run `npm run build`.

### Task 4: Verification

**Files:**
- Review changed files only.

**Interfaces:**
- Produces: a verified, uncommitted implementation for user review.

- [ ] Run `npm test` from `desktop`.
- [ ] Run `npm run build` from `desktop`.
- [ ] Run `git diff --stat` and inspect key diffs.
- [ ] Leave all changes uncommitted until the user explicitly requests a commit.
