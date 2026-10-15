---
seoTitle: "Attribute Explorer: Browse Dataverse Table Columns | PowerTools"
seoDescription: "Search every Dataverse table, list its columns with types, lookup targets, and required level, and open full field details. Free and open source."
xrmToolBoxEquivalent: "Metadata Browser"
features:
  - Search all tables by display name or logical name
  - See every column of a table in one sortable grid
  - Spot lookup targets and required level at a glance
  - Open a details view with type-specific settings and choice values
  - Copy display and logical names with one click
  - Refresh metadata to pick up changes you just made
---

## Find any table or column fast

Attribute Explorer is a read-only metadata browser for Microsoft Dataverse and Dynamics 365. It lists every table in the connected environment, and one search box filters that list by display name or logical name.

Pick a table and its columns load into a grid next to the list. The grid keeps to the five things you check most often: display name, logical name, type, the related table for lookups, and required level. Click any header to sort.

## Details when you need them

Clicking a column opens a details view with everything else about it: type-specific settings, choice values for choice columns, and copy buttons for its names. The grid stays clean, and the detail is one click away.

## Always current

Made a change in the maker portal? Use **Refresh metadata** to reload the table list and the selected table's columns from Dataverse.

## When to use it

- Looking up a column's logical name while writing a plug-in, a FetchXML query, or Web API code.
- Checking which tables a lookup can point to.
- Reviewing which columns are required before building an import.

Attribute Explorer does not create, edit, or delete metadata, so it is safe to use against production.
