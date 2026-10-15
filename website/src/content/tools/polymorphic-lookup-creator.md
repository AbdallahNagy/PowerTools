---
seoTitle: "Polymorphic Lookup Creator for Dataverse | PowerTools"
seoDescription: "Create multi-table polymorphic lookup columns in Dataverse without code. Add, update, or remove target tables and relationships, and delete lookups."
xrmToolBoxEquivalent: "Polymorphic Lookup Creator"
features:
  - Create a lookup column that points to two or more tables
  - Add the new column to an unmanaged solution
  - Use the solution publisher's prefix for schema names
  - Set relationship names, menu behavior, labels, and cascade rules per table
  - Open an existing lookup to add, remove, or update its target tables
  - Delete a polymorphic lookup after confirmation
---

## Multi-table lookups without code

A polymorphic lookup, also called a multi-table lookup, is one lookup column that can point to records in more than one table. The maker portal cannot create one. It takes an SDK call. Polymorphic Lookup Creator gives you a form for it.

Choose an unmanaged solution, the table that gets the lookup, and the tables it should point to. PowerTools suggests a schema name from the display name and applies the solution publisher's prefix.

## Full control of each relationship

Each target table gets its own one-to-many relationship. For each one, set the relationship schema name, how it appears in the related-records menu, its custom label and display order, and its cascade behavior.

## Change it later

Open an existing lookup to add a new target table, remove one, or update a relationship's settings. You can also delete the lookup column entirely, after a confirmation.

## When to use it

- Building a "regarding"-style lookup for your own tables.
- Adding a new target table to an existing multi-table lookup.
- Cleaning up a lookup that is no longer needed.
