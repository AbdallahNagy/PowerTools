# Relationship Filters in Fetch Builder - Design

Date: 2026-07-20

## Goal

Let users build FetchXML filters against fields on related Dataverse tables,
including polymorphic lookup fields such as `regardingobjectid`, without
hand-editing FetchXML. The experience should feel close to Advanced Find:
select a root table, add normal filters, and optionally choose fields through
lookup or related-table paths.

Success criteria:

- Users can filter root records by fields on a related table.
- Users can filter through polymorphic lookups by choosing the target table
  first, for example `Email > Regarding Account > Account Name`.
- Generated FetchXML uses valid `<link-entity>` joins with stable aliases.
- Existing root-field filters, grouping, drag/drop, lookup value picking,
  results paging, and FetchXML preview keep working.
- The implementation has focused tests for metadata mapping, validation, and
  FetchXML generation.

## Scope

- Metadata API: expose lookup and one-to-many relationship metadata needed by
  the Fetch Builder.
- Renderer metadata hooks: load relationship options for the selected table.
- Filter model: support condition fields represented by relationship paths.
- Filter UI: let users pick related fields from a path browser while preserving
  the current row-based filter builder.
- FetchXML renderer: emit link-entity trees and place conditions under the
  correct linked entity.
- Tests: add coverage for root filters, one-hop filters, nested filters,
  polymorphic lookup targets, shared joins, and invalid partial selections.

Out of scope for the first version:

- Many-to-many relationship filters.
- Outer joins and "does not contain related record" semantics.
- Relationship filters on selected result columns.
- Arbitrary user-authored FetchXML import back into the visual builder.

## Recommended Approach

Use relationship-path conditions.

Today each filter condition stores a root attribute name. Extend that concept so
a condition can store either a root field reference or a related field path. The
row remains visually familiar: field, operator, value. When the user chooses a
related field, the field picker displays the path label, such as
`Account (Parent Customer) > Account Name`.

This approach keeps the existing filter tree and grouping model intact. It also
maps naturally to FetchXML: the root filter keeps root conditions, while related
conditions are grouped by their relationship path and rendered inside generated
`<link-entity>` nodes.

## User Experience

The current field picker gains two sections:

- Root fields: the existing list of attributes on the selected root table.
- Related fields: an entry point that opens a compact path picker.

The related-field picker flow:

1. User chooses a relationship from the current table. This may be a lookup from
   the current table to a parent record, or a one-to-many relationship from the
   current table to child records.
2. If the relationship is polymorphic, user chooses the concrete target table.
3. User either selects a field from that related table or continues to another
   lookup relationship, up to the supported depth.
4. The selected field path is written back to the condition row.

The condition row still uses the existing operator picker and value input. The
operator list and value editor are based on the final selected field metadata,
not the root lookup field. For example, selecting related `account.name` shows
string operators, while selecting related `account.ownerid` uses lookup
operators and lookup record picking.

The first version should support a maximum path depth of two relationship hops.
That covers common Advanced Find workflows while keeping the metadata loading,
UI, and FetchXML generation understandable. The model should not hard-code the
depth so it can be raised later.

## Metadata API

Add a metadata endpoint for relationships that can be represented as FetchXML
`link-entity` joins:

`GET /api/metadata/entities/{logicalName}/relationships`

Return active, non-private relationship metadata with enough information to
generate FetchXML and display readable options:

```ts
interface RelationshipMetadata {
  schemaName: string;
  relationshipType: "many-to-one" | "one-to-many";
  sourceEntity: string;
  targetEntity: string;
  sourceAttribute: string;
  targetAttribute: string;
  displayName: string;
  isCustomRelationship: boolean;
  targets?: string[];
}
```

For a many-to-one lookup, `sourceEntity` is the current table,
`sourceAttribute` is the lookup column on the current table, `targetEntity` is
the referenced parent table, and `targetAttribute` is the referenced primary ID.
For a one-to-many relationship, `sourceEntity` is the current table,
`sourceAttribute` is the current table primary/reference column, `targetEntity`
is the child table, and `targetAttribute` is the child lookup column.

For a polymorphic lookup, expose one relationship option per concrete target if
the Dataverse metadata provides separate relationship records. If the metadata
comes back as a shared lookup attribute with multiple targets, the renderer
should treat it as a relationship that requires a target-table selection before
field selection.

The endpoint should use `RetrieveEntityRequest` with `EntityFilters.Relationships`
for the selected entity and include both `ManyToOneRelationships` and
`OneToManyRelationships`. Attribute metadata remains loaded through the existing
attributes endpoint.

## Renderer Data Model

Add explicit field references instead of overloading `FilterCondition.field`.

```ts
type FieldReference =
  | {
      kind: "root";
      field: string;
    }
  | {
      kind: "related";
      path: RelationshipPathSegment[];
      field: string;
    };

interface RelationshipPathSegment {
  relationshipSchemaName: string;
  relationshipType: "many-to-one" | "one-to-many";
  sourceEntity: string;
  targetEntity: string;
  sourceAttribute: string;
  targetAttribute: string;
  linkFromAttribute: string;
  linkToAttribute: string;
  alias: string;
}
```

For compatibility while implementing, the existing `field: string | null` can
be migrated to `fieldRef?: FieldReference` in one focused change:

- Existing conditions become `{ kind: "root", field }`.
- Field changes reset operator, value, labels, lookup target, and path metadata.
- Duplicating and moving nodes clone the full field reference.
- Validation treats missing `fieldRef` like today missing `field`.

Stable aliases should be generated from the path, not from render order. For
example:

`rel_parentcustomerid_account`

When the same path appears in multiple conditions, all those conditions must use
the same alias and only one link-entity should be emitted for that path.

The `linkFromAttribute` and `linkToAttribute` values are stored explicitly in
the selected path segment so FetchXML rendering does not need to infer join
direction later:

- Many-to-one: link target table with `from=targetAttribute` and
  `to=sourceAttribute`.
- One-to-many: link child table with `from=targetAttribute` and
  `to=sourceAttribute`.

## FetchXML Generation

Refactor FetchXML generation into three stages:

1. Normalize the filter tree into renderable root conditions and related
   condition groups keyed by relationship path.
2. Build a link tree from the related condition groups.
3. Render root filters and link-entity filters recursively.

Root condition output remains unchanged:

```xml
<condition attribute="name" operator="like" value="%Contoso%" />
```

One-hop related filter output:

```xml
<link-entity
  name="account"
  from="accountid"
  to="parentcustomerid"
  alias="rel_parentcustomerid_account"
  link-type="inner">
  <filter type="and">
    <condition attribute="name" operator="like" value="%Contoso%" />
  </filter>
</link-entity>
```

One-to-many child filter output uses the same renderer shape with different
join metadata. For example, account records with an active contact:

```xml
<link-entity
  name="contact"
  from="parentcustomerid"
  to="accountid"
  alias="rel_contact_parentcustomerid"
  link-type="inner">
  <filter type="and">
    <condition attribute="statecode" operator="eq" value="0" />
  </filter>
</link-entity>
```

Nested related filters render nested link-entity elements. If a group mixes root
conditions and related conditions, preserve the user's boolean logic by
rendering equivalent filters in the correct entity scopes where FetchXML can
represent them. If a specific mixed `or` shape cannot be represented safely in
FetchXML, validation should reject it with a clear message instead of producing
surprising XML.

The first version should support:

- Root conditions inside any group.
- Related conditions inside `and` groups.
- `or` groups when all conditions in that group target the same entity scope.

Validation should reject:

- `or` groups that mix root and linked scopes.
- `or` groups that mix different relationship paths.
- Related paths with missing relationship or target metadata.

This preserves correctness while still covering the main Advanced Find use
cases. Broader cross-scope boolean logic can be revisited later with a more
advanced FetchXML expression model.

## Components

### API

- Add relationship DTOs near `MetadataEndpoints.cs`.
- Add relationship retrieval logic that handles metadata exceptions through the
  existing `DataverseErrorFormatter`.
- Keep response shapes small; do not return full SDK metadata objects.

### Hooks

- Add `useEntityRelationships(logicalName, connectionName)`.
- Reuse `useTableMetadata` for each target entity as the user opens or expands a
  related path.
- Cache relationship and attribute metadata with TanStack Query keys that
  include connection name and logical name.

### Filter Model

- Add `FieldReference`, `RelationshipPathSegment`, and helper functions:
  - `getConditionScope(condition)`
  - `getFieldReferenceLabel(fieldRef, metadata)`
  - `resolveFieldMetadata(fieldRef, rootFields, relatedMetadata)`
- Update validation to operate on resolved field metadata.

### Filter UI

- Replace `FieldPicker` internals with a picker that can select root fields or
  launch the related-field path picker.
- Add `RelatedFieldPickerModal`.
- Keep condition rows compact by displaying the selected path as a single
  truncated label with a tooltip.
- Continue passing resolved field metadata to `OperatorPicker` and `ValueInput`.

### FetchXML Renderer

- Keep the existing escaping and operator handling behavior.
- Add link tree rendering in `model/fetchxml.ts` or move it into a small
  dedicated module if the file becomes hard to follow.
- Make the renderer deterministic so tests can compare exact XML.

## Error Handling

- If relationship metadata fails to load, show a toast and keep root-field
  filtering available.
- If target table attributes fail to load while picking a path, show the failure
  inside the modal and let the user back out.
- If a saved or duplicated condition references unavailable metadata, show a
  validation error on that row.
- If the user creates an unsupported mixed-scope `or`, show:
  `OR groups can only combine conditions from the same table path.`

## Testing

Add focused unit tests around the pure model where possible:

- Root-only filters render exactly as today.
- One-hop related filters render one `link-entity`.
- One-to-many child filters render the correct `from` and `to` join direction.
- Multiple conditions on the same path share one `link-entity`.
- Conditions on different paths render separate links.
- Nested paths render nested links.
- Polymorphic lookup path includes the selected concrete target entity.
- Mixed-scope `and` groups are accepted.
- Mixed-scope `or` groups are rejected.
- Field changes reset related path-specific value state.

Run existing project checks after implementation:

- `npm test` from `desktop`
- `npm run build` from `desktop`
- API tests if relationship endpoint logic receives unit-test coverage

## Rollout

Implement behind normal UI controls rather than a hidden flag. The first version
can launch with depth-two relationship paths and conservative `or` validation.
This gives users meaningful Advanced Find-style filtering immediately while
keeping behavior predictable.

Future enhancements:

- Many-to-many relationships.
- Outer joins and "no related record" filters.
- Related result columns.
- Import existing FetchXML into the visual model.
- Deeper relationship paths if users need them and performance remains good.
