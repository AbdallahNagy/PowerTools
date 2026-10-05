### Match

- No XrmToolBox research was run for this tool. The user asked for a lean brief written from their own specification, so the researcher stage was skipped on purpose.
- Closest XrmToolBox equivalent: **Metadata Browser** (MscrmTools). That plugin was not used as a source, and no source, UI, icons, or copy were taken from it.
- Power Tools tool id: `attribute-explorer`. Title: **Attribute Explorer**.

### What it does

- Lists every table in the selected environment, except private tables.
- Filters that list with one search box. The search is a case-insensitive substring match on the table's display name or logical name.
- Selecting a table loads all of its fields and shows them in a grid.
- The grid shows only five columns: display name, logical name, type, related table(s) for lookups, and required level.
- The field search filters the grid by display name or logical name. Grid columns sort when the user clicks a header.
- Clicking a field opens a details modal with everything else about that field. The modal shows type-specific details and option values, and has copy buttons for names.
- A **Refresh metadata** button reloads the table list and the selected table's fields from Dataverse, so the user sees changes they just made.
- The tool is read-only. It does not create, edit, delete, or publish metadata, and it does not compare environments.
- The user's own specification:
  - list all tables with an easy search box that matches display name or logical name
  - once a table is selected, list all its fields
  - two parts side by side: tables on the left, fields on the right
  - fields grid: display name, logical name, type, related table if lookup
  - clicking a field opens a modal with more information
  - do not bloat the grid; the details live in the modal
  - a refresh metadata button to pull the latest changes
  - clean project structure and best practices

### Backend findings

The existing `/api/metadata/*` endpoints (`api/PowerTools/PowerTools.API/Tools/Metadata/MetadataEndpoints.cs`) are shared by FetchXML Builder, Data Migration, and Plugin Registration. They return too little for the details modal: no schema name, description, max length, precision, min/max, auditing, security, or managed state. Changing them would change behavior for three other tools. **Do not modify them.** Add a dedicated, tool-owned endpoint group instead.

The sidecar has no metadata cache. Each request goes to Dataverse, so a refresh only has to refetch.

### Power Tools mapping

- Renderer: `desktop/src/ui/tools/attribute-explorer/`.
- Sidecar: `api/PowerTools/PowerTools.API/Tools/AttributeExplorer/`, mapped as `/api/attribute-explorer`.
- Sidecar tests: new xUnit project `api/PowerTools/PowerTools.API.AttributeExplorer.Tests/`, added to `PowerTools.sln`.

### Recommended implementation

Follow the Workflow Activities Viewer structure on both sides. It is the most recent read-only tool and the cleanest template.

**Sidecar** (`Tools/AttributeExplorer/`), mirroring `Tools/WorkflowActivities/`:

| File | Responsibility |
| --- | --- |
| `AttributeExplorerEndpoints.cs` | `MapAttributeExplorerEndpoints()`, the route group with `DataverseContextFilter`, and the result-to-HTTP mapping (`{ code, message }` problem JSON, same as Workflow Activities) |
| `AttributeExplorerClient.cs` | `IAttributeExplorerClient` with two methods: retrieve all tables (entity-level metadata only) and retrieve one table's attributes plus relationships. `DataverseAttributeExplorerClient` wraps `IOrganizationServiceAsync2`. This is the seam the tests fake. |
| `AttributeExplorerService.cs` | Calls the client, applies filtering and ordering, maps to DTOs, and turns exceptions into typed problems |
| `AttributeExplorerMapper.cs` | Pure `EntityMetadata` / `AttributeMetadata` → DTO mapping, including type-specific details |
| `AttributeExplorerDtos.cs` | Response records |
| `AttributeExplorerFaults.cs` | Problem codes, for example `table_not_found` (404) and `dataverse_error` (502 or 400, matching the Workflow Activities choice) |

Register the group in `Program.cs` next to the other `Map…Endpoints()` calls.

Endpoints:

1. `GET /api/attribute-explorer/tables` → `{ tables: TableDto[] }`
   - `RetrieveAllEntitiesRequest { EntityFilters = EntityFilters.Entity, RetrieveAsIfPublished = true }`
   - Exclude `IsPrivate == true`. Keep intersect tables, because users look up N:N tables too.
   - `TableDto`: `logicalName`, `schemaName`, `displayName` (nullable), `entitySetName`, `objectTypeCode`, `primaryIdAttribute`, `primaryNameAttribute`, `isCustom`, `isManaged`, `isIntersect`, `isActivity`, `ownershipType`.
   - Order by display name, falling back to logical name, ordinal ignore case.

2. `GET /api/attribute-explorer/tables/{logicalName}/attributes` → `{ table: TableDto, attributes: AttributeDto[] }`
   - One `RetrieveEntityRequest { EntityFilters = EntityFilters.Attributes | EntityFilters.Relationships, RetrieveAsIfPublished = true }`. Relationships are included only so a lookup can name its relationship(s).
   - Exclude attributes whose `AttributeOf` is set (for example the `…name` and `…yominame` companions). They clutter the grid and the user does not create them.
   - Return all detail in this one call, so the modal opens instantly with no second request. A large table has a few hundred attributes, which is fine.
   - `AttributeDto`:
     - Core: `logicalName`, `schemaName`, `displayName` (nullable), `description` (nullable), `attributeType` (`AttributeType` enum name), `attributeTypeName` (`AttributeTypeName?.Value`, which tells `MultiSelectPicklistType`, `ImageType`, `FileType`, and so on apart from `Virtual`), `requiredLevel` (`None` / `SystemRequired` / `ApplicationRequired` / `Recommended`), `isCustom`, `isManaged`, `isPrimaryId`, `isPrimaryName`, `sourceType` (nullable int), `introducedVersion`, `metadataId`, `columnNumber`.
     - Behavior: `isValidForCreate`, `isValidForUpdate`, `isValidForRead`, `isValidForAdvancedFind`, `isAuditEnabled`, `isSecured`, `isFilterable`, `isRetrievable` (`null` when Dataverse does not report one).
     - Type details, all nullable and set only when they apply:
       - `maxLength` for string and memo; `format` for string, memo, integer, and datetime formats; `dateTimeBehavior`
       - `minValue`, `maxValue`, `precision` for integer, bigint, decimal, double, and money
       - `targets: string[]` for lookup, customer, owner, and party list
       - `relationships: { schemaName, referencedEntity }[]` for those lookups: the many-to-one relationships where `ReferencingAttribute` equals this attribute
       - `optionSet: { name, isGlobal, options: { value, label }[] }` for picklist, multi-select picklist, state, and status
       - `booleanOptions: { trueLabel, falseLabel }` for boolean
       - `defaultValue` (nullable string) for picklist and boolean when Dataverse reports one
   - Labels: use `UserLocalizedLabel?.Label`, then the first `LocalizedLabels` entry, else `null`. The client falls back to the logical name for display.
   - Sort by display name, falling back to logical name.

**Renderer** (`desktop/src/ui/tools/attribute-explorer/`):

```
tool.ts                          defineTool manifest
attribute-explorer-icon.svg      original icon, same stroke style as the other tool icons
AttributeExplorer.tsx            ToastProvider wrapper + page composition only
api/
  queryKeys.ts                   ["attribute-explorer", connectionName, "tables"] and [..., "attributes", logicalName]
  attributeExplorerApi.ts        useTables, useTableAttributes (React Query, apiGet, meta.connectionName)
model/
  types.ts                       TableInfo, AttributeInfo, … matching the DTOs
  apiError.ts                    problem JSON → user message
  search.ts                      filterTables, filterAttributes (pure)
  attributeType.ts               friendly type label from attributeType + attributeTypeName (pure)
  requiredLevel.ts               requiredLevel → label (pure)
  sort.ts                        grid sorting (pure)
components/
  TablesPane.tsx                 search box, count, list, loading, empty, and error states
  FieldsPane.tsx                 header, field search, grid, empty states
  FieldDetailsModal.tsx          the details modal
  CopyButton.tsx                 small copy-to-clipboard button (tool-private)
tests/
  fixtures.ts
  node/*.test.ts                 search, type label, required label, sort
  renderer/attributeExplorer.test.tsx
```

- Register `attributeExplorerTool` in `registry.tsx` in alphabetical order, so it goes first after `welcomeTool`. Add the matching `PUBLIC_TOOLS` entry in the same position in `publicCatalog.ts`.
- Use `useTabConnection`, `useToolStatus`, `apiGet`, and the shared UI (`Button`, `DataTable`, `Modal`, `SearchInput`, `Spinner`, `useToast`) through their public modules only.
- Use `react-resizable-panels` for the split, as Workflow Activities Viewer does.
- Both queries use `staleTime: Infinity`. Metadata is cached for the tab session, and switching back to a table is instant. Only **Refresh metadata** refetches.

### Dataverse review

- **Messages.** `RetrieveAllEntitiesRequest` with `EntityFilters.Entity` only. Never use `EntityFilters.All` or `Attributes` for all tables, because that is tens of MB and very slow on large orgs. `RetrieveEntityRequest` with `Attributes | Relationships` for the one selected table. Both messages are read-only.
- **RetrieveAsIfPublished = true.** The maker portal shows unpublished label and description changes, and the user's "refresh to see what I just changed" expectation only holds if the tool shows them too. New columns are live without publishing either way. The existing shared endpoints use `false`; that is intentional for them and must not change.
- **Privileges.** Any user who can sign in can read metadata. No special privilege is needed. A security-role failure surfaces as a fault, which is shown through the problem JSON.
- **Online versus on-premises.** Both messages behave the same on Dataverse online and Dynamics 365 on-premises 9.x. Some newer properties, such as `IsRetrievable` and `SourceType` value 3, may be absent on older on-premises builds. Treat every boolean or optional property as nullable and render "—" when it is absent.
- **Labels.** `UserLocalizedLabel` follows the calling user's UI language and can be null on tables or fields that lack a label in that language. Fall back to `LocalizedLabels[0]`, then to the logical name on the client. The table search must therefore also match the logical name, which it does.
- **Private and intersect tables.** Private tables (`IsPrivate`) are not usable through the SDK. Exclude them. Intersect tables are real and queryable. Keep them.
- **AttributeOf companions.** Fields such as `primarycontactidname` or `owneridyominame` have `AttributeOf` set. They are read-only shadows of a lookup. Excluding them matches the other Power Tools metadata endpoints and keeps the grid clean.
- **Type names.** `AttributeType` reports `Virtual` for multi-select choice, image, and file fields. Use `AttributeTypeName.Value` (`MultiSelectPicklistType`, `ImageType`, `FileType`) to tell them apart. `Customer` and `Owner` are lookups with several targets. `PartyList` has targets too.
- **SourceType.** `0` Simple, `1` Calculated, `2` Rollup. Newer Dataverse uses `3` for formula (Power Fx) columns; this was not verified against the referenced SDK version, so show "Formula" for `3` and the raw number for anything else.
- **Managed state.** `IsManaged` is per component. Show it in the modal only, as "Managed" or "Unmanaged".
- **Failure modes.**
  - Unknown table: the fault message contains "Could not find" or the error code `0x80040217` / `-2147220969`. Return `table_not_found` (404). The UI shows "This table no longer exists. Refresh metadata." and clears the selection on refresh.
  - Connection or authentication failure: the existing `DataverseContextFilter` handles it. Do not duplicate it.
  - Throttling (429 / service protection): surface the message. No automatic retry, because the user can press refresh.
- **Performance.** On large orgs the table list takes 1–4 s and one table's attributes take under 1 s. Show spinners. There is no paging on these messages.

### UX

- **One-sentence description** (for `publicCatalog.ts`): "Browse every table in an environment and inspect its fields, types, and lookups."
- **Layout.** A horizontal resizable split. Left pane, tables, defaults to about 30% (min 20%). Right pane, fields, takes the rest. A thin toolbar row across the top of the tool holds **Refresh metadata** (`Button`, secondary style, refresh icon, disabled while fetching, with a spinner while it runs). It applies to the whole tool.
- **Tables pane.**
  - Header: "Tables" and the count, either `812` or `24 of 812` while filtering.
  - `SearchInput` with placeholder "Search by display or logical name". It is autofocused when the tool opens with a connection.
  - The list is one row per table: display name in primary text, logical name below in muted, monospace, smaller text. The selected row is highlighted with the primary color. Rows are buttons; arrow keys move the selection while the list has focus.
  - States:
    - Loading: a centered `Spinner` with "Loading tables…".
    - Error: an inline message with a **Retry** button, plus a toast.
    - No match: `No tables match "{query}".`
- **Fields pane.**
  - No table selected: centered muted text, "Select a table to see its fields."
  - Header: the table display name (white, semibold), its logical name (muted, mono) with a copy button, and the field count (`143 fields` / `12 of 143`).
  - Field `SearchInput` with placeholder "Search fields by display or logical name". The field search resets when the table changes.
  - Grid (`DataTable`, every column sortable, default display name ascending). Clicking a row opens the modal.

    | Column | Content |
    | --- | --- |
    | Display name | Label, or the logical name in muted text when there is no label |
    | Logical name | Monospace |
    | Type | Friendly label: Single line of text, Multiple lines of text, Whole number, Big integer, Decimal, Float, Currency, Date and time, Yes/No, Choice, Choices, Lookup, Customer, Owner, Party list, Status, Status reason, Unique identifier, Image, File, Entity name, Virtual; unknown values show the raw name |
    | Related table | Lookup-like types only: the targets comma-joined, truncated with an ellipsis, with the full list in a `title` tooltip |
    | Required | Optional (muted), Required, System required, Recommended |

  - Loading: a spinner in the pane. Error: an inline message with **Retry**, plus a toast. No match: `No fields match "{query}".`
- **Field details modal** (shared `Modal`, `max-w-2xl`).
  - Title: the display name. Directly below: the logical name and schema name, each with a copy button.
  - Sections, rendered as label/value rows. Hide a row whose value is null. Hide a whole section when every row in it is empty.
    1. **General**: Type (friendly label plus the raw type name in muted text), Required, Description, Custom or System, Managed or Unmanaged, Primary id / Primary name (only when true), Source (Simple / Calculated / Rollup / Formula), Introduced version, Column number, Metadata id.
    2. **Type details**: Max length, Format, Date and time behavior, Min / Max, Precision, Default value.
    3. **Related tables** (lookups): one row per target. The table name is a link button: clicking it closes the modal and selects that table in the left pane, clearing the table search if that table is filtered out. The relationship schema name is shown next to it.
    4. **Options** (choice, choices, status, status reason, yes/no): the option set name and Global/Local, then a compact two-column list of value and label.
    5. **Behavior**: Valid for create / update / read, Valid for Advanced Find, Auditing enabled, Field security, Filterable, Retrievable. Shown as "Yes", "No", or "—".
- **Refresh metadata.** It refetches the table list and, when a table is selected, that table's fields. It keeps both search boxes and the selection. If the selected table no longer exists, it clears the selection. If the open modal's field no longer exists after refresh, it closes the modal. When the refresh finishes it shows a short success toast: "Metadata refreshed".
- **Connection change.** Reset the selection, both searches, and the modal.
- **No connection.** Use the same text as the other tools: "Right-click this tab and choose Change connection."
- **Status bar** (`useToolStatus`):
  - "No environment selected"
  - "Loading tables…"
  - "812 tables"
  - "Loading fields for account…"
  - "account: 143 fields"
  - "Could not load …"
- **Copy.** Use `navigator.clipboard.writeText`, as FetchXML Builder already does. Briefly change the icon to a check mark, with an `aria-label` of "Copy logical name" or "Copy schema name".
- **Colors.** Follow `desktop/.agents/skills/ui-colors/SKILL.md`. Only use `var(--color-…)` tokens, with no new hex values.
- **Multiple tabs.** `allowMultipleInstances: true`.
- **Do not build:**
  - editing or creating fields
  - an export of the whole grid
  - a custom-only toggle
  - extra grid columns
  - relationship or key browsers
  - comparing environments
  - showing `AttributeOf` companion fields

### Open questions

- Whether to show `AttributeOf` companion fields (for example `…name` and `…yominame`) later, behind a toggle. They are excluded for now.
