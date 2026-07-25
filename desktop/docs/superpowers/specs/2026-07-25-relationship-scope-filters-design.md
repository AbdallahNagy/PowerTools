# Relationship Scope Filters - Design

Date: 2026-07-25

## Goal

Make related-table filtering read like the filter it generates. A user selects a
lookup relationship once, which creates an indented relationship scope. Fields
inside that scope are ordinary conditions for the related table, and its lookup
relationships can create deeper scopes recursively.

## Interaction

Every condition field picker lists:

1. Fields for the current table.
2. Lookup relationships owned by the current table under `Related tables`.

Selecting a field keeps the row as a normal condition. Selecting a relationship
replaces that row with a relationship scope containing one empty condition:

```text
AND
  Subject contains "invoice"
  Regarding > Account
    AND
      Account Name begins with "Contoso"
      Primary Contact
        AND
          Email contains "@contoso.com"
```

The relationship header shows its lookup path label and has remove and duplicate
actions. It does not show `contains data`: selecting the relationship implies a
positive relationship join. Negative relationship existence is out of scope.

## Relationship Scope

Only `many-to-one` relationships are selectable. These correspond to lookup
columns on the current table. One-to-many child collections and many-to-many
relationships are not listed.

A polymorphic lookup produces one selectable relationship per concrete target,
for example `Regarding > Account`, `Regarding > Contact`, and `Regarding > Case`.
Labels include the lookup column so multiple paths to the same table remain
distinguishable.

Each relationship node owns a normal `FilterGroup`. The group can contain field
conditions, nested groups, and further relationship nodes. Metadata for the
target table is loaded lazily when its relationship node is rendered and is
cached by connection and logical table name.

## Model

Add an explicit relationship node:

```ts
interface FilterRelationship {
  id: string;
  kind: "relationship";
  relationship: RelationshipPathSegment;
  group: FilterGroup;
}
```

`FilterNode` becomes `FilterCondition | FilterGroup | FilterRelationship`.
Existing path-based `FieldReference` values remain renderable for compatibility,
but the new UI creates root field references relative to their containing
relationship scope.

Selecting a relationship calls
`replaceConditionWithRelationship(conditionId, relationship)`. This preserves
the original row position and avoids leaving an empty condition beside the new
scope. The relationship starts with an `AND` group and one blank condition.

Tree operations recurse through both group children and relationship-owned
groups. Removing, duplicating, moving, and validation treat a relationship scope
as one node.

## FetchXML

Render each relationship node as an inner `link-entity` using its stored join
attributes and deterministic alias. Render the node's group filter inside that
link, followed by recursively nested relationship nodes.

The root group renders root conditions and root relationship links. A
relationship group's field conditions are local to that link and therefore use
ordinary field references.

Relationship nodes are supported only under `AND` groups. Validation rejects a
relationship node directly contained by an `OR` group because moving an inner
join in and out of an OR expression changes query semantics. OR groups remain
available inside a relationship scope for conditions on that related table.

## Error Handling

- Loading target metadata shows an inline loading state inside the relationship
  scope.
- A metadata failure remains inside that scope and does not hide other filters.
- A relationship under an OR parent shows a validation error:
  `Related table filters can only be added to AND groups.`
- Empty relationship groups and incomplete child conditions use the existing
  group and condition validation messages.

## Testing

- An explicit relationship node renders one inner `link-entity`.
- Conditions inside its group render under that link.
- A relationship nested inside another relationship renders nested links.
- OR conditions inside one relationship scope remain an OR filter.
- Relationship nodes under an OR parent are rejected.
- Lookup relationship options exclude one-to-many relationships.
- Existing root and legacy path-based related conditions still render.

## Constraints

- Do not add negative relationship existence in this change.
- Do not add one-to-many or many-to-many relationship selection.
- Do not change root-field filtering, field operators, value editors, grouping,
  drag/drop, result paging, or FetchXML preview behavior.
- Keep all work uncommitted until the user explicitly requests a commit.
