# Relationship Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Fetch Builder users filter records by fields on related Dataverse tables, including regarding/polymorphic lookup targets.

**Architecture:** Add a small relationship metadata endpoint, represent condition fields as root or related field references, and render related conditions as deterministic FetchXML `link-entity` joins. Keep the existing filter tree UI shape and add a modal path picker for related fields.

**Tech Stack:** ASP.NET Core minimal APIs, Microsoft Dataverse SDK metadata, React 19, TypeScript, TanStack Query, existing Node test runner.

## Global Constraints

- Preserve existing root-field filter behavior and generated FetchXML.
- Support many-to-one lookup paths and one-to-many child relationship paths.
- Support polymorphic lookup targets by letting the user choose a concrete target table.
- Limit UI path selection to two relationship hops in the first version.
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

### Task 3: Related Field Picker UI

**Files:**
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/FieldPicker.tsx`
- Create: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/RelatedFieldPickerModal.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/ConditionNode.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/GroupNode.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/FilterBuilder/FilterTree.tsx`
- Modify: `desktop/src/ui/components/tools/MetadataExplorer/index.tsx`

**Interfaces:**
- Consumes: `RelationshipMetadata[]`, `EntityInfo[]`, `useTableMetadata`, `fieldRef`
- Produces: condition rows that can select root fields or related field paths.

- [ ] Pass connection name and tables into the filter builder.
- [ ] Replace the field select with a compact button/select hybrid that can choose root fields or open related-field modal.
- [ ] In the modal, browse up to two relationship hops and select a final field.
- [ ] Resolve final field metadata for `OperatorPicker` and `ValueInput`.
- [ ] Reset operator/value state when `fieldRef` changes.
- [ ] Run `npm run build`.

### Task 4: Verification and Commit

**Files:**
- Review changed files only.

**Interfaces:**
- Produces: verified implementation commit.

- [ ] Run `npm test` from `desktop`.
- [ ] Run `npm run build` from `desktop`.
- [ ] Run `git diff --stat` and inspect key diffs.
- [ ] Commit implementation with `feat: add relationship filters to fetch builder`.
