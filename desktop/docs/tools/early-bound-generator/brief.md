# Early Bound Generator

Built directly from a short request ("keep it simple and easy to understand and use"), not through the full research pipeline. Comparable tools: Daryl LaBar's Early Bound Generator for XrmToolBox and `pac modelbuilder build`. This tool keeps only their core job.

### What it does

- Lists the tables in the tab's environment (private tables are hidden).
- The user ticks tables, enters a C# namespace (default `Dataverse.Model`), and chooses **Generate**.
- Returns one file, `Entities.cs`, that the user can copy or save:
  - one `partial class` per table that derives from `Entity`, with `EntityLogicalName`, a `Fields` class of column logical-name constants, and one typed property per column
  - one enum per choice column (`<Table>_<Column>`), with members named from the option labels
  - `[assembly: ProxyTypesAssembly]`, so `ServiceClient` and `OrganizationServiceContext` return the typed classes
- The output compiles as C# 7.3, so it works in .NET Framework plug-in projects.

Not built, on purpose: settings files, option filtering, a LINQ service context, custom API messages, one file per table, and writing into a project folder.

### Backend

`api/PowerTools/PowerTools.API/Tools/EarlyBound/`

- `GET /api/early-bound/tables`: one `RetrieveMetadataChangesRequest` with entity properties only.
- `POST /api/early-bound/generate` with `{ namespace, tables }`: one `RetrieveMetadataChangesRequest` filtered to the chosen logical names, which reads only the column properties the writer needs. Up to 500 tables.
- Columns left out: helper columns that have `AttributeOf` set (for example `*name` and `*yominame`), file columns, and other virtual columns. Read-only columns (not valid for create or update) get a getter only.

Type mapping: text, memo, and entity name map to `string`. Whole number maps to `int?`. Big integer maps to `long?`. Decimal maps to `decimal?`. Float maps to `double?`. Currency maps to `Money`. Yes/No maps to `bool?`. Date and time maps to `DateTime?`. Unique identifier maps to `Guid?`. Lookup, customer, and owner map to `EntityReference`. Choice, status, and status reason map to a nullable enum. Multi-select choice maps to `OptionSetValueCollection`, and its enum is still generated. Party list maps to `EntityCollection`. Image maps to `byte[]`.

### Implementation notes and test evidence

- Sidecar: `dotnet test PowerTools.sln` passed. The new `PowerTools.API.EarlyBound.Tests` project has 12 tests. Sample generated output also compiled with `LangVersion 7.3` against `Microsoft.PowerPlatform.Dataverse.Client` with no warnings.
- Desktop: `npm run typecheck`, `npm run lint -- --max-warnings 0`, `npm test` (510 tests), and `npm run build:renderer` passed. In the cloud container, the Electron smoke test fails to launch on `main` too, because the container has no display.

### Open questions

None.
