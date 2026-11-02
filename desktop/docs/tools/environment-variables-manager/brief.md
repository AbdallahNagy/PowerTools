# Environment Variables Manager

### Match

- **Plugin:** Environment Variable Manager, by MscrmTools (Tanguy Touzard).
  - Catalog page: https://www.xrmtoolbox.com/plugins/MscrmTools.EnvironmentVariableManager/
  - NuGet id: `MscrmTools.EnvironmentVariableManager`, latest version 1.2026.9.18 (released 2026-09-03).
  - Tag "Configuration", marked open source, about 81.5k downloads across all versions.
  - Description: "This tool helps you to manage your environment variables easily".
- **Source:** https://github.com/MscrmTools/MscrmTools.EnvironmentVariableManager. I read a shallow clone at commit `cd152a0`, dated 2026-09-02.
- **License:** GNU GPL v3 (the `LICENSE` file at the repo root). This is copyleft and Power Tools is MIT. We may learn the Dataverse operations and rules from it. We must not copy its code, its UI layout or its text.
- **Related plugins I considered:**
  - `err403.SolutionManagment` (Solution Management): browses environment variables, compares values between a source and a target environment, and bulk-transfers them. It is a good reference for a later "compare and push to target" feature. I did not read its source.
  - `XrmToolSuite.EnvironmentInventory`: read-only. It lists definitions but no values.
  - `Emmetienne.TOMLConfigManager.XrmToolbox`: not about environment variables.
- **Confidence: high.** This is the plugin dedicated to the job, it is widely used and maintained by the most prolific XrmToolBox author, and its whole backend is about 600 lines of readable code. I checked the type and secret-store values against Microsoft Learn's `environmentvariabledefinition` table reference.
- **Existing Power Tools coverage:** none. The registered tools are attribute-explorer, bulk-workflow-execution, data-migration, fetchxml-builder, fetchxml-tester, plugin-registration, polymorphic-lookup-creator, solution-components-mover, solution-layers-explorer, translator and workflow-activities-viewer. The only mention of environment variables is in Solution Components Mover. It treats component type 380 (the definition) as having no subcomponents when copying (`api/PowerTools/PowerTools.API/Tools/SolutionComponentsMover/SolutionComponentsMoverService.cs:264-268`). None of them lists, edits or deletes environment variables.

### What it does

- Lists every environment variable definition with:
  - display name, schema name and type;
  - its current value, from the `environmentvariablevalue` row if one exists;
  - a warning when the value row belongs to a managed solution.
- Filters the list with a client-side text search on name, schema name and value.
- Lets you edit current values inline, then save all changed rows at once. Saving creates a value row when there is none and updates it otherwise. Each row is marked as succeeded or failed.
- Gives type-specific editing:
  - **Number:** checked to be a decimal.
  - **Boolean:** must be `yes` or `no`.
  - **JSON:** edited in a code editor.
  - **Secret:** built from the parts of an Azure Key Vault secret path.
- Creates a definition (schema name, display name, description, default value, type) and can add it to an unmanaged solution.
- Updates a definition. Schema name and type are locked after creation.
- Deletes a definition, which removes its value too.
- Exports to Excel with one sheet per environment, and imports from Excel with a preview that marks each row New, Update or Same. Import creates any missing definitions, can add them to a solution, and upserts the values.
- Copies a variable's name, schema name or value to the clipboard.

### Backend findings

All paths are relative to `MscrmTools.EnvironmentVariableManager/MscrmTools.EnvironmentVariableManager/` in the plugin repository.

**Tables and columns**
- `environmentvariabledefinition` (solution component type **380**):
  - `schemaname`: required, max length 100, cannot be changed after create.
  - `displayname`, `description`.
  - `defaultvalue`: Memo, max 2000.
  - `type`: a choice. 100000000 String, 100000001 Number, 100000002 Boolean, 100000003 JSON, **100000004 Data Source**, 100000005 Secret.
  - `secretstore`: 0 Azure Key Vault, 1 Dataverse.
  - Other columns: `valueschema`, `hint`, `isrequired`, `parentdefinitionid`, `connectionreferenceid`, `statecode`.
- `environmentvariablevalue` (component type **381**):
  - `environmentvariabledefinitionid`: lookup to the definition.
  - `value`.
  - In practice there is at most one value row per definition.

**List (`Forms/EnvVarsForm.cs:128-183`)**
- One `RetrieveMultiple` on `environmentvariabledefinition` with `NoLock = true`.
- Columns: `displayname, schemaname, type, description, defaultvalue`.
- Joins, all LEFT OUTER:
  - to `environmentvariablevalue` (alias `val`; columns `value`, `environmentvariablevalueid`);
  - from the value's id to `solutioncomponent.objectid`;
  - then to `solution` (columns `friendlyname`, `uniquename`), with the link filtered to `ismanaged = true`, `uniquename != Default` and `uniquename != Active`.
- Ordered by `displayname`.
- Because of the solution joins, a definition can come back as several rows. The plugin collapses them by grouping on `schemaname` (`EnvVarsForm.cs:78-81`). Any solution friendly names found become the "imported with a managed solution" warning, which says an Upgrade import could remove the value (`:91-101`).
- Gaps to fix in our version:
  - **No paging**, so the list silently stops at 5000 rows.
  - The `solutioncomponent` join has no `componenttype = 381` filter.

**Save values (`EvmControl.cs:408-507`)**
- Per changed row:
  - no value row yet: `Create` an `environmentvariablevalue` with `environmentvariabledefinitionid` and `value`;
  - otherwise: `Update` that row's `value`.
- Rows are saved one at a time, without `ExecuteMultiple`. Errors are collected per row and the loop carries on.
- Keep: the per-row result, and handing back new value ids. Leave behind: errors keyed by the value text (`errors.Add(item.Item4, …)`), which throws on duplicate values.

**Value validation (`EnvVarsForm.cs:267-306`, `AppCode/Validator.cs`)**
- Number: `decimal.TryParse` with invariant culture and a decimal point only. Negative numbers are rejected, which is probably a bug.
- Boolean: exactly `"yes"` or `"no"`, which is how Dataverse stores booleans for environment variables.
- JSON: not validated.
- Secret (`Forms/SecretForm.cs`): the value is a Key Vault resource path, `/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.KeyVault/vaults/{vault}/secrets/{name}`. It is parsed by splitting on `/` and expecting 11 parts.
- We should validate all of these in the sidecar, not only in the UI.

**Create or update a definition (`Forms/VariableForm.cs:43-97`, `EvmControl.cs:516-568`)**
- Builds an `environmentvariabledefinition` with `schemaname, displayname, description, defaultvalue, type`, then calls `Create` (new) or `Update` (existing id).
- If a solution was picked, it then runs `AddSolutionComponentRequest { ComponentId = defId, ComponentType = 380, SolutionUniqueName }`.
- Bugs to avoid:
  - The plugin shows type 100000004 as "Connection reference", but Dataverse's label is "Data Source". Because the type is chosen by matching the label text (`cbbType.SelectedItem = FormattedValues["type"]`), editing a Data Source variable fails.
  - The add-to-solution step checks the wrong error variable (`evt.Error` instead of `evt2.Error`).
  - The list only refreshes when a solution was picked.
- Better approach: create with `CreateRequest` and set the `SolutionUniqueName` parameter, so the record is created inside the solution in one call. Use `AddSolutionComponent` only for existing definitions.
- The schema name needs the selected solution's publisher prefix. Our polymorphic-lookup tool already queries solutions together with `publisher.customizationprefix` (`api/PowerTools/PowerTools.API/Tools/PolymorphicLookup/PolymorphicLookupRequests.cs:82-106`).

**Delete (`EvmControl.cs:323-359`)**
- `Delete("environmentvariabledefinition", defId)`, which also removes the value.
- The plugin has **no "delete value only"** action (to fall back to the default value). This brief adds one: `Delete("environmentvariablevalue", valueId)`.
- Expected failures:
  - Deleting a definition that belongs to a managed solution is blocked.
  - Deleting while a flow or app still depends on it can fail on the dependency check. Before deleting, consider calling `RetrieveDependenciesForDeleteRequest { ComponentType = 380, ObjectId }`.

**Excel import and export (`AppCode/ExcelManager.cs`, `UserControls/ExcelImportDialog.cs`, `EvmControl.cs:73-206`)**
- Export columns: Display Name, Name, Description, Value, Type. One sheet per environment, named after the organization.
- Import matches rows by `schemaname`. For a new definition it maps the type label to the code, creates the definition, optionally adds it to a solution, then creates the value. For an existing one it runs `RetrieveMultiple` on `environmentvariablevalue` for that definition and then updates or creates the value.
- Gotchas:
  - A new definition gets a value row created twice: once at line 145, then again because the lookup at line 157 finds it and updates it. It works, but wastes a call.
  - An unknown type shows a message and `return`s, which aborts the rest of the import. Our version should skip that row and report it.
  - It uses EPPlus with a NonCommercial license. We must not adopt that.
- I recommend deferring this to phase 2. If we add it, use CSV or JSON through the existing desktop file-dialog capability, not EPPlus.

**Privileges and connection**
- Needs read, create, write and delete on both tables, plus customizer rights for solutions. It works on a single connection only; there is no target connection.

**Keep vs leave behind**
- **Keep:**
  - the list query shape, with a value-type filter and paging added;
  - per-type validation;
  - create the value row when none exists, otherwise update it;
  - the managed-solution warning;
  - definition create with solution membership;
  - schema name and type locked after create;
  - delete definition.
- **Leave behind:**
  - the WinForms grid, docking, row colouring and Scintilla editor;
  - EPPlus;
  - the type label mapping, including the Data Source mislabel;
  - silently capping the list at 5000 rows;
  - the PayPal and GitHub plugin interfaces.

### Power Tools mapping

- **Reuse:**
  - Desktop: `apiGet/apiPost/apiPut/apiDelete` with `meta.connectionId`, `useTabConnection`, `useToolStatus`, `useOpenInBrowser` (to open the solution or the maker portal), and shared UI (`DataTable`, `SearchInput`, `Modal`, `Field`, `Input`, `Combobox`, `CodeEditor` for JSON, `Badge`, `Alert`, `Toast`).
  - Sidecar: `DataverseContextFilter` and `DataverseClientFactory`.
  - None of the existing metadata or fetch endpoints fit, because this is record CRUD on system tables.
- **New sidecar group:** `/api/environment-variables` in `api/PowerTools/PowerTools.API/Tools/EnvironmentVariables/`. Files: `EnvironmentVariablesEndpoints.cs`, `EnvironmentVariablesQueries.cs`, `EnvironmentVariablesService.cs`, `EnvironmentVariablesDtos.cs`, `EnvironmentVariablesFaults.cs`. Register it with `app.MapEnvironmentVariablesEndpoints()` in `Program.cs`. Endpoints, in the order to build them:

| Method and path | What it does | Dataverse call |
| --- | --- | --- |
| `GET /api/environment-variables` | Returns `EnvironmentVariableDto[]` with `definitionId, schemaName, displayName, description, type (int), typeLabel, defaultValue, valueId?, currentValue?, secretStore?, isManaged, managedValueSolutions: string[]`. | Paged `RetrieveMultiple` with the joins described above (filter `componenttype = 381`), grouped by definition id on the server. |
| `GET /api/environment-variables/solutions` | Returns `{ uniqueName, friendlyName, prefix }[]` for unmanaged, visible solutions other than Default. | `RetrieveMultiple` on `solution` linked to `publisher`. |
| `POST /api/environment-variables/definitions` | Body `{ schemaName, displayName, description?, type, defaultValue?, initialValue?, solutionUniqueName? }`; returns the new definition. | `CreateRequest` with the `SolutionUniqueName` parameter, then create the value if `initialValue` is set. |
| `PUT /api/environment-variables/definitions/{id}` | Updates `displayName`, `description` and `defaultValue` only; `schemaName` and `type` are rejected. Optional `solutionUniqueName` adds the definition to that solution. | `Update`, then `AddSolutionComponentRequest` (380). |
| `DELETE /api/environment-variables/definitions/{id}` | Deletes the definition; 409 with the dependency list when blocked. | Optional `RetrieveDependenciesForDeleteRequest`, then `Delete`. |
| `POST /api/environment-variables/values` | Bulk save. Body `{ items: [{ definitionId, valueId?, value }] }`; returns per-item `{ definitionId, valueId, ok, error? }`. | Per item: validate against the definition's type, then `Create` or `Update`. Optionally `ExecuteMultipleRequest` with `ContinueOnError = true` and batches of about 100. |
| `DELETE /api/environment-variables/values/{valueId}` | Removes the current value so the default applies. | `Delete("environmentvariablevalue")`. |

- **Contracts:** keep them tool-local (`model/types.ts`). Nothing needs promoting to `shared/contracts` yet.
- **Desktop tool:**
  - id `environment-variables-manager`
  - title "Environment Variables"
  - tooltip "List, create, update, and delete Dataverse environment variables and their current values"
  - `allowMultipleInstances: true`
  - Folder `desktop/src/ui/tools/environment-variables-manager/`:
    - `tool.ts`
    - `EnvironmentVariablesManager.tsx`
    - `environment-variables-manager-icon.svg`
    - `api/` (`environmentVariablesApi.ts`, `queryKeys.ts`)
    - `model/` (`types.ts`, `valueValidation.ts`, `secretPath.ts`, `apiError.ts`)
    - `components/` (`VariableTable.tsx`, `ValueEditor.tsx`, `DefinitionPanel.tsx`, `DeleteDialog.tsx`, `SecretPathEditor.tsx`)
    - `tests/` (`fixtures.ts`, `node/`, `renderer/`)
- **Placement:** a new activity-bar tool, not an extension of an existing one. FetchXML Builder and Data Migration do not fit.
- **Phase 2 ideas, out of scope here:**
  - compare and push values to a target environment using `meta.targetConnectionId` and `DataverseTargetContextFilter`, as Solution Management does;
  - CSV or JSON import and export.

### Recommended implementation

1. **Sidecar DTOs and queries.** Write the type codes as a C# enum with all six values, including Data Source (100000004). Add a paged list query with value and solution joins and a server-side group-by. Add the solution and publisher query.
2. **Sidecar service and validation.**
   - Number: invariant decimal, negatives allowed.
   - Boolean: `yes` or `no`.
   - JSON: must parse.
   - Secret: Key Vault path regex when `secretstore = 0`.
   - Schema name: must start with the solution's publisher prefix plus `_`, at most 100 characters.
   - Reject changes to `schemaName` or `type` on update.
   - Map Dataverse faults (managed component, dependency, privilege) to typed problem responses, as in `SolutionLayersFaults.cs`.
3. **Endpoints and `Program.cs` registration**, with `DataverseContextFilter`.
4. **Sidecar tests:** query builders (link filters, paging), the validation table, and the create-vs-update branch.
5. **Desktop tool module:**
   - react-query list keyed by `connectionId`;
   - inline edits held as a local dirty set and saved through one bulk mutation, with per-row results shown;
   - a type-aware value editor (CodeEditor for JSON, structured fields for a Secret path, a yes/no toggle for Boolean);
   - a create/edit definition panel with solution picker and prefix hint;
   - confirm-before-delete dialogs for definition and value;
   - a managed-value warning badge;
   - status-bar counts through `useToolStatus`.
6. **Registration:** add the tool to `registry.tsx` and `publicCatalog.ts` in registry order, run `node scripts/sync-readme-tools.mjs`, and add `website/src/content/tools/environment-variables-manager.md`.
7. **Desktop tests:** validation and secret-path parsing (node), and the table with dirty-state save flow plus the delete confirm (renderer, with fixtures).

**Risks:**
- Value edits on a managed-solution value can be overwritten by the next Upgrade import; show the warning.
- Large environments can exceed 5000 definitions; page the list.
- We must never fetch or show secret contents. Do not call `RetrieveEnvironmentVariableSecretValue`. The stored value is only the Key Vault reference path.
- Do not ship EPPlus.
- **License:** the plugin is GPL-3.0. Use these findings as domain knowledge only, write the code fresh, and credit "Environment Variable Manager by MscrmTools" in the brief and on the website page.

Sources:
- [XrmToolBox catalog: MscrmTools.EnvironmentVariableManager](https://www.xrmtoolbox.com/plugins/MscrmTools.EnvironmentVariableManager/)
- [NuGet: MscrmTools.EnvironmentVariableManager](https://www.nuget.org/packages/MscrmTools.EnvironmentVariableManager/)
- [GitHub: MscrmTools/MscrmTools.EnvironmentVariableManager](https://github.com/MscrmTools/MscrmTools.EnvironmentVariableManager)
- [NuGet: err403.SolutionManagment](https://www.nuget.org/packages/err403.solutionmanagment)
- [NuGet: XrmToolSuite.EnvironmentInventory](https://packages.nuget.org/packages/XrmToolSuite.EnvironmentInventory)
- [Microsoft Learn: EnvironmentVariableDefinition table reference](https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/environmentvariabledefinition)

### Open questions

- **License (answered by the user):** The source plugin is GPL-3.0. Proceed clean-room: use it only as domain knowledge, copy no code, UI or text. The user chose **not** to credit the plugin on the website page, so omit `xrmToolBoxEquivalent` and any plugin mention there.
- **Scope (answered by the user):** First version is CRUD only: list, filter, inline value edits with bulk save, create/edit/delete definitions, delete values. CSV/JSON import and export, and compare/push to a target environment, are deferred to a later phase.
