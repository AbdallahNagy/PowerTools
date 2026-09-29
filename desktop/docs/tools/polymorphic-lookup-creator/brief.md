### Match

- Plugin name: Polymorphic Lookup Creator. Catalog URL: https://www.xrmtoolbox.com/plugins/MscrmTools.PolymorphicLookupCreator/. NuGet id: `MscrmTools.PolymorphicLookupCreator`. Author: MscrmTools.
- Catalog description: "Create the shiny new polymorphic lookups columns without a line of code." Latest catalog version: `1.2024.5.14` (released 2024-05-14, 15970 downloads of that version, 63707 downloads across versions). Open source: true. Project URL: https://github.com/MscrmTools/MscrmTools.PolymorphicLookupCreator.
- The XrmToolBox export name inside the assembly is "Polymorphic Lookup Manager". The catalog name, NuGet title, and requested Power Tools name are Polymorphic Lookup Creator. Assembly version in `Properties/AssemblyInfo.cs` is `1.2024.5.14`, matching the catalog. The `.nuspec` still says `1.0.0` and is stale.
- Source read at commit `6b73594d0b9553841ff7d77e3892063d335fa7a6` (2024-05-14, "Fixed issue #19 XrmToolbox error while updating existing polymorphic lookup").
- License: **GNU General Public License v3.0 (GPL-3.0)**. Confirmed from the GitHub repository license API (`spdx_id: GPL-3.0`) and the repo `LICENSE` file. This is a copyleft license. Power Tools must not copy this plugin's source, WinForms UI, icons, or unique copy into the MIT-licensed repo. The brief records the behavior so it can be reimplemented against the public Dataverse SDK. Do not start that implementation until the license impact is accepted.
- Related catalog overlap, not used as the source: Multi Target Lookup Generator (author Luke Thomas, NuGet `MultiTargetLookupGenerator`, latest `1.0.0.3`, open source, https://www.xrmtoolbox.com/plugins/MultiTargetLookupGenerator/, https://github.com/code-nybbler/MultiTargetLookupGenerator). It also creates multi-target lookups and has fewer downloads. Its source was not read.
- Confidence: high. The user-supplied catalog URL matches the author, NuGet id, version, open-source flag, and GitHub project, and the Dataverse calls below were read from that repository.

### What it does

- Lists unmanaged solutions and takes the selected solution's publisher customization prefix.
- Lists tables that can be the referencing (primary) side of a relationship, and tables that can be the referenced side.
- Creates a polymorphic lookup column on a referencing table, aimed at two or more referenced tables, and includes that column in the selected unmanaged solution.
- For each referenced table, sets the one-to-many relationship schema name, Advanced Find visibility, associated-menu behavior, display zone, display order, custom label, and cascade behavior.
- Opens an existing lookup on the referencing table, including a managed lookup, and adds, removes, or updates its relationships.
- Deletes an existing lookup column after confirmation.
- Suggests a schema-name fragment from the display name, then prefixes it with the publisher prefix.
- Treats an elastic referencing table as a special case that forces every cascade action to no cascade when a relationship is added.
- Requires one selected environment. It does not compare or copy lookups across environments.

### Backend findings

Source root: `MscrmTools.PolymorphicLookupCreator/` in https://github.com/MscrmTools/MscrmTools.PolymorphicLookupCreator at `6b73594`. There are no plugin tests. The live Dataverse calls are in `AppCode/MetadataManager.cs`, `Forms/SolutionPicker.cs`, and the command handlers in `PluginControl.cs`. `AppCode/SolutionManager.cs` and `MetadataManager.GetPolymorphicLookups` are not called by the control.

**Create.** `MetadataManager.CreatePolymorphicLookup` (`AppCode/MetadataManager.cs` 177-244) executes an `OrganizationRequest` whose `RequestName` is `CreatePolymorphicLookupAttribute`. Parameters:

- `OneToManyRelationships`: one `OneToManyRelationshipMetadata` per referenced table.
- `Lookup`: a `LookupAttributeMetadata` with `SchemaName` and `DisplayName` only. The display name is a `Label` whose user-localized label and single localized label both use the organization base language.
- `SolutionUniqueName`: the unmanaged solution unique name.

The response `Results["AttributeId"]` is parsed as a `Guid` and then ignored by `PluginControl.tsbCreate_Click` (`PluginControl.cs` 386-406). The column is added to the solution by `SolutionUniqueName` on this request. `SolutionManager.AddLookupToSolution` (`AppCode/SolutionManager.cs` 68-79), which calls `AddSolutionComponentRequest` with `ComponentType` 2, `AddRequiredComponents` false, and the attribute id, is never called.

Default relationship schema, built in the control (`PluginControl.cs` 186-192 and 219-225) and again inside `CreatePolymorphicLookup` when no relationship object was supplied (`MetadataManager.cs` 193-196): `{prefix}{referencingLogicalName}_{referencedLogicalName}_{lookupSchemaName}`. `lookupSchemaName` is already `{prefix}{schemaFragment}` (`PluginControl.cs` 381-391). Names longer than 100 characters are cut to 100 in `CreatePolymorphicLookup` (`MetadataManager.cs` 217-220). A new relationship object sets `IsValidForAdvancedFind` true. Referenced names passed from the list are the table schema name lowercased, and later code compares that string to `LogicalName` (`PluginControl.cs` 379 and 108-110). That matches Dataverse when the logical name is the lowercased schema name.

**Add a relationship to an existing lookup.** `MetadataManager.AddRelationship` (`MetadataManager.cs` 136-175) executes `CreateOneToManyRequest` with:

- `Lookup`: the existing `LookupAttributeMetadata` found on the referencing table by logical name.
- `OneToManyRelationship`: the edited relationship, with `ReferencedEntity`, `ReferencedAttribute` (the referenced table primary id), `ReferencingEntity`, and `ReferencingAttribute` (the lookup logical name) filled in before the call.
- `SolutionUniqueName`.

`FaultException<OrganizationServiceFault>` with `ErrorCode` `-2147192813` is rethrown as "This lookup is not a polymorphic lookup" (`MetadataManager.cs` 167-173). Any other fault is rethrown unchanged.

**Update a relationship.** `MetadataManager.UpdateRelationship` (`MetadataManager.cs` 391-398) executes `UpdateRelationshipRequest` with `Relationship` set to the edited `OneToManyRelationshipMetadata` and `MergeLabels` true. No solution unique name is sent.

**Delete a relationship.** `MetadataManager.DeleteRelationship` (`MetadataManager.cs` 255-267) finds `ManyToOneRelationships` where `ReferencedEntity` equals the referenced table and `ReferencingAttribute` equals the lookup logical name. It then executes `DeleteRelationshipRequest` with `Name` set to that relationship schema name. If none is found it throws "Unable to find relationship between entities {referencing} and {referenced} for lookup {lookup}".

**Delete the column.** `MetadataManager.DeleteAttribute` (`MetadataManager.cs` 246-253) executes `DeleteAttributeRequest` with `EntityLogicalName` and `LogicalName`. No solution is required. The control asks for confirmation first (`PluginControl.cs` 415-429).

**Edit order.** `PluginControl.tsbEdit_Click` (`PluginControl.cs` 451-530) computes three sets from the checked referenced tables versus `LookupAttributeMetadata.Targets`: relationships to add, relationships to remove, and existing relationships whose `RelationshipInfo.IsUpdated` is true. It then calls add, then delete, then update, each in a plain `foreach`. There is no `ExecuteTransactionRequest`, `ExecuteMultipleRequest`, retry, or rollback. A fault stops the loop and leaves earlier steps applied. The confirmation text lists the three sets. "No changes detected" returns before any call (`PluginControl.cs` 481-484). "Cannot remove all relationships from a polymorphic lookup" returns when the checked set is empty (`PluginControl.cs` 464-467). A solution is required before this sequence even when every change is an update or a delete (`PluginControl.cs` 491-495).

**Metadata load.** `GetAvailableEntitiesForRelationship` (`MetadataManager.cs` 269-332) executes `RetrieveMetadataChangesRequest` with `ClientVersionStamp` null (full retrieve, no delta) and this `EntityQueryExpression`:

- Entity filter: (`CanBePrimaryEntityInRelationship` equals true OR `CanBeRelatedEntityInRelationship` equals true) AND `IsIntersect` equals false.
- Entity properties requested: `DisplayName`, `SchemaName`, `LogicalName`, `PrimaryIdAttribute`, `CanBePrimaryEntityInRelationship`, `CanBeRelatedEntityInRelationship`, `Attributes`, `OneToManyRelationships`, `ManyToOneRelationships`. `TableType` is not requested.
- Attribute query: `AttributeType` equals Lookup. Properties: `DisplayName`, `SchemaName`, `LogicalName`, `Targets`. An `IsManaged` equals false condition is present but commented out (`MetadataManager.cs` 317-319), so managed lookups stay in the result. The 2024 nuspec notes say managed lookup columns can be updated.

The referencing-table list is tables with `CanBePrimaryEntityInRelationship`. The referenced-table list is tables with `CanBeRelatedEntityInRelationship` (`PluginControl.cs` 302-316). Choosing a referencing table fills the lookup list with every returned lookup schema name, plus a create-new entry (`PluginControl.cs` 140-142). It does not require `Targets.Length > 1`.

`GetPolymorphicLookups` (`MetadataManager.cs` 334-389) is unused. It would exclude managed lookups and keep only lookups whose `Targets.Length` is greater than 1. The live tool does not do that.

**Organization language.** `LoadBaseLanguage` (`MetadataManager.cs` 400-415) runs `RetrieveMultiple` on `organization` with `NoLock` true, `TopCount` 1, and column `languagecode`. If no row returns it throws "Unable to find organization record". That code is the label language for the new lookup and for a relationship custom label (`UserControls/RelationshipPanel.cs` 319-340).

**Solutions.** The picker, not `SolutionManager.Load`, queries `solution` (`Forms/SolutionPicker.cs` 59-100): `NoLock` true, `ColumnSet` true, link to `publisher` on `publisherid` with alias `pub` and column `customizationprefix`, condition `ismanaged` equals false, order `friendlyname` ascending. There is no paging cookie and no page size. Selecting a solution copies `pub.customizationprefix` plus `_` into the prefix (`PluginControl.cs` 49-59). Create and edit read `uniquename` from the selected solution.

**Relationship settings that are written.** `UserControls/RelationshipPanel.cs` 28-178 and `RelationshipPanel.Designer.cs` 126-386:

- Cascade presets: Parental (assign, delete, merge, reparent, share, unshare = Cascade; rollup view = NoCascade); Referential, which is the `default` branch (assign, merge, reparent, share, unshare = NoCascade; delete = RemoveLink; rollup view = NoCascade); Referential, restrict delete (same, with delete = Restrict); Custom.
- Custom assign, share, unshare, reparent, and merge options: Cascade, Active (`CascadeType.Active`), Owner (`CascadeType.UserOwned`), None (`CascadeType.NoCascade`). An unrecognized label becomes Cascade.
- Custom delete options: All (`CascadeType.Cascade`), Remove link (`CascadeType.RemoveLink`), Restrict (`CascadeType.Restrict`), None (`CascadeType.NoCascade`).
- Associated menu behavior: Use plural name (`AssociatedMenuBehavior.UseCollectionName`), Custom label (`UseLabel`), Do not display (`DoNotDisplay`).
- Display zone: Details, Sales, Service, Marketing (`AssociatedMenuGroup`).
- Display order: numeric, minimum 10000, maximum 99999, default 10000.
- `IsValidForAdvancedFind`, defaulting to true when the metadata value is null (`RelationshipPanel.cs` 217).
- Custom label stored as a `LocalizedLabel` in the organization language.

`RelationshipInfo.IsUpdated` (`MetadataManager.cs` 51-68) is true when schema name, menu behavior, menu group, menu order (null treated as 10000), assign, delete, merge, reparent, share, unshare, `IsValidForAdvancedFind`, the user-localized menu label, or the localized label collection differs from the values cached when the relationship was loaded. Cached null cascades become NoCascade, except delete, which becomes RemoveLink (`MetadataManager.cs` 96-102). Archive and rollup view are not part of this comparison.

The panel's load path classifies an existing cascade as Referential only when merge is Cascade (`RelationshipPanel.cs` 272-291), while choosing Referential writes merge as NoCascade (`RelationshipPanel.cs` 79-87). The same merge mismatch exists for Referential, restrict delete. That classification does not match the values the preset writes.

Opening the relationship panel on a new relationship with a null cascade classifies it as Parental and then writes the Parental cascade (`RelationshipPanel.cs` 255-297). A checked table whose panel was never opened keeps only schema name, referenced entity, and `IsValidForAdvancedFind` true (`PluginControl.cs` 186-192).

**Elastic tables.** If `EntityMetadata.TableType` equals `"Elastic"`, `AddRelationship` replaces the cascade with Archive, Assign, Delete, Merge, Reparent, RollupView, Share, and Unshare all set to `CascadeType.NoCascade` (`MetadataManager.cs` 145-158). `CreatePolymorphicLookup` does the same only when it has to fabricate a relationship because none was passed (`MetadataManager.cs` 199-212). The metadata query does not request `TableType`, so this branch depends on a property the query does not ask for.

**Paging, batching, retries, privileges.** No paging-cookie loop, no batch size, no throttling retry, no `WhoAmI`, no caller-id impersonation, and no privilege query. Solution retrieve wraps a `FaultException` inner exception as "Error while retrieving solutions: {message}" (`SolutionPicker.cs` 92-99). Other failures are shown as the exception message from the create, edit, or delete worker (`PluginControl.cs` 292-296, 395-399, 433-437, 534-538). The plugin does not call `PublishXml` or `PublishAllXml`.

**Validation the control enforces before a Dataverse call.**

- Create: a solution, a referencing table, a non-empty display name, and a non-empty schema fragment (`PluginControl.cs` 354-376). It does not require a minimum number of checked referenced tables.
- Checking or selecting a referenced table requires a non-empty prefix and schema fragment (`PluginControl.cs` 172-176 and 203-206).
- Edit: at least one referenced table must remain; otherwise the user is told to delete the column. No-op edits are refused. A solution is required once a change exists.
- Delete: yes/no confirmation, then `DeleteAttributeRequest`.
- Schema fragment suggestion (`PluginControl.cs` 552-576): compatibility-decompose the display name, drop non-ASCII characters, Pascal-case each space-separated word, and append `Id` unless the fragment already ends with `Id`. Editing an existing lookup makes display name and schema read-only and derives the prefix from the schema name's first underscore segment (`PluginControl.cs` 94-98). Relationship schema name is editable only while the relationship is new (`RelationshipPanel.cs` 300-302).

**Keep.** `CreatePolymorphicLookupAttribute`, `CreateOneToManyRequest`, `UpdateRelationshipRequest` with `MergeLabels` true, `DeleteRelationshipRequest`, `DeleteAttributeRequest`, the unmanaged-solution query with publisher prefix, the organization `languagecode` label, the metadata filter for non-intersect tables that can be primary or related, lookup attributes including managed ones, the relationship schema pattern and 100-character cut, the cascade and associated-menu values the panel writes, elastic all-NoCascade on add, the add-then-delete-then-update order, the empty-target edit refusal, the `-2147192813` message, and the missing-relationship message.

**Leave behind.** WinForms layout, XrmToolBox connection UI, the PayPal and GitHub plugin interfaces, `Settings.LastUsedOrganizationWebappUrl`, icons, the unused `GetPolymorphicLookups` managed-and-single-target filter, the unused `AddSolutionComponentRequest` helper, and the Referential preset classifier that expects merge Cascade while the preset writes merge NoCascade.

### Power Tools mapping

tool id: `polymorphic-lookup-creator`

This is a new activity-bar tool. FetchXML Builder only reads existing polymorphic lookups when building relationship filters. Data Migration moves rows. Plugin Registration manages plug-in assemblies. None of them create or edit lookup metadata. `desktop/src/ui/tools/` has no polymorphic-lookup tool.

Desktop, following `desktop/AGENTS.md` and `desktop/src/ui/tools/AGENTS.md`:

- Folder: `desktop/src/ui/tools/polymorphic-lookup-creator/`.
- `tool.ts` via `defineTool`: id `polymorphic-lookup-creator`, title `Polymorphic Lookup Creator`, tooltip `Create and manage Dataverse polymorphic lookup columns`, `showInActivityBar: true`.
- Register once in `desktop/src/ui/tools/registry.tsx`.
- Private `api/`, `model/`, `components/`, and `tests/` under that folder. Import shared UI, `useConnections` / `useConnectionSelection`, and `apiGet` / `apiPost` / `apiPut` / `apiDelete` from `desktop/src/ui/shared`. Pass `meta.connectionName` for the single selected environment. Publish progress with `useToolStatus`.
- Do not call the Dataverse SDK, raw IPC, or `window.electron` from the renderer. No new Electron IPC. Do not promote these contracts to `desktop/src/ui/shared/contracts` unless a second tool needs them.

Sidecar, under `api/PowerTools/PowerTools.API/Tools/PolymorphicLookup/`, registered from `Program.cs` on a group that uses `DataverseContextFilter` and `DataverseClientFactory`. Do not extend the current metadata routes for this tool. `GET /api/metadata/entities` does not return relationship capability flags, schema name, or table type. `GET /api/metadata/entities/{logicalName}/attributes` is one table at a time and does not return relationship cascade or menu metadata. `GET /api/metadata/entities/{logicalName}/relationships` does not return cascade, associated menu, or Advanced Find. There is no solutions route.

New endpoints:

1. `GET /api/polymorphic-lookups/metadata`
   - Dataverse: the `RetrieveMetadataChangesRequest` from `GetAvailableEntitiesForRelationship`, plus `TableType` on the entity property list because `AddRelationship` already reads it and the current query omits it. Also `RetrieveMultiple` on `organization` (`TopCount` 1, column `languagecode`) so the client can label new columns the way `LoadBaseLanguage` does.
   - Response: `languageCode`, and `entities[]` with `logicalName`, `schemaName`, `displayName`, `primaryIdAttribute`, `canBePrimaryEntityInRelationship`, `canBeRelatedEntityInRelationship`, `tableType`, `lookups[]` (`logicalName`, `schemaName`, `displayName`, `targets`, and `isManaged` when the platform returns it), and `manyToOne[]` (`schemaName`, `referencingAttribute`, `referencedEntity`, `referencedAttribute`, `isValidForAdvancedFind`, cascade actions, associated menu behavior, group, order, and label).
   - Do not apply the unused `GetPolymorphicLookups` filter.

2. `GET /api/polymorphic-lookups/solutions`
   - Dataverse: the unmanaged `solution` query in `SolutionPicker.RetrieveSolutions`, including the publisher link and `customizationprefix`.
   - Response: `uniqueName`, `friendlyName`, `version`, `publisherName`, `customizationPrefix`. No paging loop, matching the plugin.

3. `POST /api/polymorphic-lookups`
   - Body: `solutionUniqueName`, `referencingEntityLogicalName`, `displayName`, `schemaName`, `relationships[]` (referenced entity logical name, relationship schema name, `isValidForAdvancedFind`, cascade, associated menu).
   - Dataverse: `CreatePolymorphicLookupAttribute` as in `CreatePolymorphicLookup`. Build the lookup `Label` with the organization language code. Cut a relationship schema name to 100 characters. When `tableType` is `Elastic` and the relationship has no cascade, set every cascade action including Archive and RollupView to NoCascade, matching the fabricate branch.
   - Response: `attributeId`.

4. `POST /api/polymorphic-lookups/relationships`
   - Body: `solutionUniqueName`, `referencingEntityLogicalName`, `referencingAttributeLogicalName`, and one relationship payload.
   - Dataverse: `CreateOneToManyRequest` as in `AddRelationship`, including the elastic all-NoCascade override. Map fault `-2147192813` to the same "not a polymorphic lookup" failure.

5. `PUT /api/polymorphic-lookups/relationships/{schemaName}`
   - Body: cascade, associated menu, and `isValidForAdvancedFind`.
   - Dataverse: `UpdateRelationshipRequest` with `MergeLabels` true.

6. `DELETE /api/polymorphic-lookups/relationships/{schemaName}`
   - Dataverse: `DeleteRelationshipRequest`. If the metadata row cannot be resolved, return the plugin's unable-to-find-relationship failure.

7. `DELETE /api/polymorphic-lookups/{entityLogicalName}/{attributeLogicalName}`
   - Dataverse: `DeleteAttributeRequest`.

The desktop sequences an edit as add, then delete, then update, and stops on the first fault so earlier steps remain, matching `tsbEdit_Click`. Report each phase through `useToolStatus`.

### Recommended implementation

1. Add sidecar request and response types for the seven endpoints, plus a service that builds the SDK requests above. Validate solution unique name, referencing table, display name, and schema name before create. On edit, reject a result with zero referenced tables and reject a no-op change set. Truncate relationship schema names to 100 characters. Map fault `-2147192813` and a missing relationship to the plugin messages. Query `organization.languagecode` for labels.
2. Register the route group in `api/PowerTools/PowerTools.API/Program.cs` with `DataverseContextFilter`.
3. Add sidecar tests that assert the request name `CreatePolymorphicLookupAttribute`, `CreateOneToManyRequest` arguments, `UpdateRelationshipRequest.MergeLabels`, `DeleteRelationshipRequest` name, `DeleteAttributeRequest` targets, the unmanaged solution filter, the metadata filter, the 100-character cut, the elastic NoCascade override, and the empty-target rejection. Use a fake organization service. Do not use organization credentials.
4. Add `desktop/src/ui/tools/polymorphic-lookup-creator/` with `tool.ts`, private API hooks, a model for the cascade and menu values the panel writes, and components that load metadata and solutions for the selected connection. Default the schema fragment from the display name using the same character rules, without copying the plugin method. Keep display name and schema read-only when an existing lookup is selected. Require confirmation before delete. Require a solution before create and before an edit that will call Dataverse.
5. Register the tool once in `desktop/src/ui/tools/registry.tsx`.
6. Add renderer tests with a fake API for create validation, the zero-target edit refusal, the add/delete/update call order, and the `-2147192813` error display.

License constraint: GPL-3.0. Reimplement from these Dataverse messages and rules. Do not copy plugin source, designer files, icons, or user-facing sentences into the repo. Credit Polymorphic Lookup Creator by MscrmTools and https://github.com/MscrmTools/MscrmTools.PolymorphicLookupCreator in the tool's about text.

Do not call the unused `AddSolutionComponentRequest` path. Do not filter the lookup list down to unmanaged multi-target lookups. Do not add a publish request. Do not copy the Referential classifier that treats merge as Cascade. Do not add a second environment.

### Dataverse review

Evidence is Microsoft Learn, not the plugin. Action contract: [CreatePolymorphicLookupAttribute](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/createpolymorphiclookupattribute). Relationship sides: [CanBePrimaryEntityInRelationship](https://learn.microsoft.com/en-us/dotnet/api/microsoft.xrm.sdk.metadata.entitymetadata.canbeprimaryentityinrelationship) and [CanBeRelatedEntityInRelationship](https://learn.microsoft.com/en-us/dotnet/api/microsoft.xrm.sdk.metadata.entitymetadata.canberelatedentityinrelationship). Typed create: [CreateOneToManyRequest](https://learn.microsoft.com/en-us/dotnet/api/microsoft.xrm.sdk.messages.createonetomanyrequest). Elastic matrix: [Create and edit elastic tables](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-edit-elastic-tables). Fault names and codes: [Web service error codes](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/org-service/web-service-error-codes). Page size: [Page results](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query/page-results). Transactions: [Execute messages in a single database transaction](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/org-service/use-executetransaction). Solutions: [Solution concepts](https://learn.microsoft.com/en-us/power-platform/alm/solution-concepts-alm).

#### Messages and metadata

`CreatePolymorphicLookupAttribute` matches the action. `OneToManyRelationships` is required. `Lookup` is nullable on that action. `SolutionUniqueName` is the unmanaged solution that receives the new lookup attribute. The response carries `AttributeId`. The published sample sets `ReferencedEntity`, `SchemaName`, and `ReferencingEntity` on each relationship and omits `ReferencedAttribute`, so the fabricate path that omits `ReferencedAttribute` matches the sample. The sample also sets lookup `AttributeType`, `AttributeTypeName`, and `Description`; the plugin sends `SchemaName` and `DisplayName` only.

`CreateOneToManyRequest` is a real request. Its `Lookup` and `OneToManyRelationship` properties are required, and `SolutionUniqueName` puts the new solution components in that solution. The Microsoft sample uses it to create a new single-target lookup. The plugin's add path passes the existing lookup metadata into the same request. No separate "add polymorphic target" message appears in the action list or the error catalog.

`UpdateRelationshipRequest` with `MergeLabels` true is the right label behavior when the edit only writes the organization base language: merge keeps labels in other languages. That request has no `SolutionUniqueName`. `DeleteRelationshipRequest.Name` is the relationship schema name. `DeleteAttributeRequest` takes `EntityLogicalName` and `LogicalName` and has no solution parameter. None of these messages publish. `PublishXml` and `PublishAllXml` stay out.

`CanBePrimaryEntityInRelationship` means the table can be the referenced entity (the lookup target, the one side). `CanBeRelatedEntityInRelationship` means the table can be the referencing entity (the table that holds the lookup, the many side). Both are `BooleanManagedProperty` values. The plugin fills the referencing list from `CanBePrimaryEntityInRelationship` and the referenced list from `CanBeRelatedEntityInRelationship`. Those lists are reversed. The metadata filter that keeps a non-intersect table when either flag is true is still a valid retrieve filter; the client split has to use the opposite flag from the plugin. `IsIntersect` false correctly drops many-to-many intersect tables.

The lookup's own relationships are `ManyToOneRelationships` on the referencing table. `OneToManyRelationships` on that table are relationships where it is the target. `RetrieveMetadataChanges` with `ClientVersionStamp` null returns a full snapshot of the requested properties only. `IsManaged` and `IsCustomizable` are absent from the attribute property list, so they come back unset; a missing `IsManaged` must not be treated as unmanaged. `TableType` is also absent, so the plugin's elastic branch does not see `"Elastic"` on this query. [EntityMetadata.TableType](https://learn.microsoft.com/en-us/dotnet/api/microsoft.xrm.sdk.metadata.entitymetadata.tabletype) does not document the allowed strings.

Organization base language is `organization.languagecode`. `TopCount` 1 is enough; there is one organization row. The [CreateOneToManyRequest sample](https://learn.microsoft.com/en-us/dotnet/api/microsoft.xrm.sdk.messages.createonetomanyrequest) lowercases schema name to logical name, which matches the plugin's schema-name-to-`LogicalName` comparison. New attribute, relationship, and schema names must start with the solution publisher's customization prefix (`InvalidNamePrefix`), start with a letter (`SchemaNameNotStartwithLetter`), and contain only letters, digits, and underscores (`SchemaNameContainsNonAlphaNumericCharacters`). `SchemaNameLengthExceedsLimit` reports the maximum as a parameter. The relationship `SchemaName` property page does not state 100. The plugin's 100-character cut is unverified as that maximum. A cut can still collide (`EntityRelationshipSchemaNameNotUnique`) or match a column on the referenced table (`RelationshipSchemaNameConflictWithFieldNameOnReferencedEntity`, `0x80090422`).

Polymorphic cascade is fixed. `CascadeBehaviorNotSupportedInPolymorphicLookup` (`0x80090426`, `-2146892762`) allows only Assign, Merge, Reparent, Share, Unshare, and RollupView as `NoCascade`, and Delete as `RemoveLink`. The plugin's Referential write matches that set. Parental, Referential Restrict Delete, and Custom values outside that set are rejected. Archive is not in the allow-list. The sample relationships that set a cascade use this referential set; the sample relationship that omits cascade leaves the platform default.

Elastic tables support one-to-many, and many-to-one only when the many table is a standard table. Cascade Delete, Reparent, Assign, Share, and Unshare are unsupported. The plugin's elastic override sets every action, including Delete, to `NoCascade` on the referencing table. Delete `NoCascade` is outside the polymorphic allow-list, and an elastic referencing table is outside the many-to-one matrix.

The create action requires at least one relationship: `RelationshipsMissingFromCreatePolymorphicLookupAttribute` (`0x80090421`, `-2146892767`). One relationship is valid. A one-target polymorphic lookup still cannot lose that relationship (`LastPolymorphicRelationshipCannotBeDeleted`, `0x80090420`, `-2146892768`) and still cannot change style (`PolymorphicLookupStyleCannotBeUpdated`, `0x80090427`, `-2146892761`). `Targets` length greater than 1 is not the definition of a polymorphic lookup. The same table cannot be both sides (`CannotCreateSelfReferentialPolymorphicLookup`, `0x80090423`). Each target table can appear once (`EntityCanOnlyBeReferencedOnceInPolymorphicLookup`, `0x80090424`). A solution-aware referencing table is rejected (`PolymorphicLookupNotSupportedInSolutionAwareEntity`, `0x80090428`). The metadata query does not request `IsSolutionAware`.

#### Paging and batching

The unmanaged solution query uses `RetrieveMultiple` with no page size and no paging cookie. Dataverse returns at most 5,000 rows per page. `MoreRecords` and the paging cookie are the way to continue. The plugin reads neither, so an environment with more than 5,000 unmanaged solutions silently drops the rest. `ColumnSet` true is valid and heavier than the columns the picker uses. `NoLock` does not change the online result.

`RetrieveMetadataChanges` has no paging cookie. `ClientVersionStamp` null loads every matching table, every lookup, and both relationship collections in one response. That call can hit the channel timeout or service-protection throttling. The plugin does not retry.

An edit cannot be one database transaction. `ExecuteTransactionRequest` is documented as a transaction around data changes, and its sample creates rows. `UnsupportedMessageForExecuteTransaction` rejects a request the transaction does not support. These metadata messages stay separate calls. Add, then delete, then update is required when a save replaces every current target: deleting the last relationship first returns `LastPolymorphicRelationshipCannotBeDeleted`. A fault after an earlier call leaves that earlier call applied. There is no rollback.

#### Privileges and connection

The signed-in connection user is the caller. `WhoAmI` and `CallerId` impersonation are not part of these messages. The user needs read access to `solution`, `publisher`, and `organization`, and a role that can customize the environment. System Customizer and System Administrator can. The `CreatePolymorphicLookupAttribute` action page does not list privilege logical names, so those `prv*` names stay unverified.

#### Online versus on-premises

`CreatePolymorphicLookupAttributeApiIsNotActive` (`0x80090425`, `-2146892763`) is the gate: "CreatePolymorphicLookupAttribute API is not enabled." No Learn page reviewed here states an on-premises build that enables it. Elastic tables and the `"Elastic"` table type are Dataverse online (Azure Cosmos DB). On-premises SQL organizations do not have that matrix. `CreateOneToMany`, `UpdateRelationship`, `DeleteRelationship`, `DeleteAttribute`, `RetrieveMetadataChanges`, and `organization.languagecode` are ordinary organization-service operations. Whether an on-premises server still needs `PublishAllXml` before the new column appears in the client UI was not verified. These requests do not publish.

#### Solution and managed limits

`SolutionUniqueName` on `CreatePolymorphicLookupAttribute` is an unmanaged solution. A managed solution unique name is outside that parameter. Schema names must use that solution publisher's prefix (`InvalidNamePrefix`). `CreateOneToManyRequest.SolutionUniqueName` adds the new relationship components to that unmanaged solution, which is why the unused `AddSolutionComponent` helper is unnecessary.

You cannot edit components inside a managed solution. Customizations of a customizable managed component are written in the unmanaged layer. `UpdateRelationship` and `DeleteRelationship` do not accept a solution unique name, so the solution chosen for a pure update or delete is not sent to Dataverse. Deleting a managed column, or a relationship that belongs to the managed layer, fails managed-property evaluation (`CannotDeleteMetadata`) unless the component is removed by uninstalling the managed solution. Uninstalling a managed solution also deletes data stored in its custom columns.

#### Failure modes

- Zero relationships on create: `RelationshipsMissingFromCreatePolymorphicLookupAttribute`.
- Cascade other than Assign/Merge/Reparent/Share/Unshare/RollupView = `NoCascade` and Delete = `RemoveLink`: `CascadeBehaviorNotSupportedInPolymorphicLookup`. The elastic all-`NoCascade` override fails this rule on Delete.
- Same table on both sides, or the same target twice.
- Solution-aware referencing table, or a referenced table with no lookup view (`ReferencedEntityMustHaveLookupView`).
- Schema prefix, character, length, uniqueness, reserved-word, and referenced-column name clashes listed above.
- Adding a target to a lookup whose style cannot change: `PolymorphicLookupStyleCannotBeUpdated`. The plugin instead maps `-2147192813` to "This lookup is not a polymorphic lookup". That code is `DuplicateAttributeSchemaName` (`0x80047013`), message `{0}`.
- Deleting the last relationship: `LastPolymorphicRelationshipCannotBeDeleted`. System customer relationships use the sibling fault `CustomerRelationshipCannotBeDeleted`.
- Delete of a column that is still referenced: `CannotDeleteInUseComponent`, `CannotDeleteAttributeUsedInWorkflow`, and the same family of dependency faults. One `DeleteAttribute` either removes the column and its relationships or leaves them.
- Managed-property failure on update or delete of a non-customizable managed component.
- API disabled: `CreatePolymorphicLookupAttributeApiIsNotActive`.
- Partial edit: earlier adds, deletes, or updates remain after a later fault.
- Stale metadata on delete: the plugin's "unable to find relationship" message is thrown before `DeleteRelationshipRequest` when the local `ManyToOneRelationships` row is missing.

#### Plugin claims that are wrong

- `-2147192813` means the lookup is not polymorphic. The catalog names that code `DuplicateAttributeSchemaName`.
- Referencing tables are `CanBePrimaryEntityInRelationship` and referenced tables are `CanBeRelatedEntityInRelationship`. Those properties mean the opposite sides.
- Parental, restrict-delete, and custom cascade values are valid polymorphic relationship settings. Only the referential set above is accepted.
- An elastic referencing table must be saved with every cascade action, including Delete, set to `NoCascade`. Polymorphic Delete must be `RemoveLink`, and elastic many-to-one is supported when the many table is standard.
- Create may call Dataverse with no referenced tables. The action requires at least one relationship.
- One unpaged solution query returns every unmanaged solution. The page cap is 5,000 rows.
- The selected solution is an argument to update and delete. Those two requests have no `SolutionUniqueName`.

#### Plugin claims that remain unverified

- Relationship schema names are limited to exactly 100 characters. The length fault's maximum is a server parameter, and the `SchemaName` property page states none.
- Managed lookup columns can take new relationships or relationship edits. The source comment and nuspec say so. Learn documents unmanaged-layer customization when managed properties allow it, and does not document this message on a managed polymorphic lookup.
- Privilege logical names for `CreatePolymorphicLookupAttribute` and the relationship messages.
- `SchemaName` and `DisplayName` alone are sufficient lookup metadata on every environment. The action sample also sets type and description.
- `IsValidForAdvancedFind` and the associated-menu behavior, group, order, and label are stored, and Advanced Find or the form associated menu then shows the polymorphic lookup. Menu order 10000–99999 was not found as a service limit.
- An on-premises build where `CreatePolymorphicLookupAttribute` is enabled, and whether `PublishAllXml` is still required there.
- `TableType` values, and whether requesting `TableType` faults on a server that has no such property.
- A metadata flag that distinguishes a one-target polymorphic lookup from a normal lookup. `Targets` length does not.
- A polymorphic lookup whose referenced table is elastic. Elastic one-to-many is supported and elastic cascade is not; the fault for that combination was not documented.

### UX

#### Sidebar

- Tool id `polymorphic-lookup-creator`. Show it in the activity bar (`showInActivityBar: true`).
- Title: **Polymorphic Lookup Creator**. Tooltip: **Create, update, and delete polymorphic lookups for the selected environment**.
- One tab only (`allowMultipleInstances: false`). The tab follows the single selected environment.
- Icon: a new monochrome SVG. The activity bar already inverts sidebar icons. Do not reuse an XrmToolBox plugin icon.

#### Title bar

No title-bar menu item. Leave File, Edit, View, and Help unchanged. The tool opens only from the sidebar.

#### Tool tab

One tab, two columns, bound to the active connection. The left column is context. The right column is the editor. The tab background is `bg-[var(--color-bg-dark)]`. Each column is `bg-[var(--color-bg-darker)]` with a `border-[var(--color-border-dark)]` divider. No extra windows.

1. **No environment.** If no environment is selected, both columns stay empty except one message: select an environment from the connection control at the bottom of the tool sidebar. Do not load solutions or tables.
2. **Unmanaged solution.** `SearchInput` and a `DataTable` of unmanaged solutions, with display name and publisher customization prefix. One row is selected. The prefix is shown again as `text-[var(--color-text-dark-gray)]` and is the only prefix used for new schema names. A lookup created from this tab is included in that solution. There is no inclusion checkbox.
3. **Referencing table.** After a solution is selected, `SearchInput` and a `DataTable` of tables that can be the referencing side. One row is selected. If that table is elastic, show muted helper text: new relationships on this table use no cascade.
4. **Existing lookups.** After a referencing table is selected, `SearchInput` and a `DataTable` of lookups on that table, including managed lookups. Columns: display name, schema name, managed or unmanaged, and referenced tables. A managed row is labeled Managed. `Button` **New lookup** opens a blank editor. Selecting a row opens that lookup. `Button` **Delete** is enabled only when a row is selected.
5. **Editor.** Same editor for a new lookup and an existing one, including a managed lookup. Until the user chooses New lookup or a row, the right column reads **Select a lookup or create one.**
   - Display name is a tool-local text input on a new lookup. On an existing lookup the display name and the column schema name are read-only.
   - Schema name: the publisher prefix is fixed text. The fragment is a tool-local text input on a new lookup. When the display name changes and the user has not edited the fragment, replace the fragment with a suggestion derived from the display name. Leave a fragment the user has edited unchanged.
   - Referenced tables: `SearchInput` and a `DataTable` of tables that can be the referenced side. Each row has a `Checkbox`. **Create lookup** and **Save** stay disabled until at least two tables are checked.
   - The user selects one checked row to edit that relationship. Fields, and no others: relationship schema name, Advanced Find visibility (`Checkbox`), associated-menu behavior, display zone, display order, custom label, and cascade behavior (one control per cascade action). The relationship schema name uses the same prefix-plus-fragment pattern. Suggest the fragment from that referenced table's display name only for a relationship that is not saved yet, and only until the user edits it. A saved relationship's schema name is read-only. The other relationship fields stay editable. Choice options come from the tool data.
   - Elastic referencing table: when a relationship is added, set every cascade action to no cascade and disable those controls. The helper text stays visible.
   - `Button` **Create lookup** for a new lookup, or **Save** for an existing one. `Button` **Cancel** closes the editor. If the editor is dirty, Cancel, New lookup, a different lookup row, and a connection change each ask in a `Modal` before discarding.
   - **Save** that would remove one or more relationships opens a `Modal` listing those referenced tables before the save runs. Adds and field updates save without that modal.
6. **Delete.** **Delete** opens a `Modal` that names the lookup display name and schema name. `Button` **Delete** confirms. `Button` **Cancel** closes the modal. Confirm deletes the lookup column.

Changing the selected environment reloads this tab for that environment. If the editor is dirty, confirm discard first. The tab never shows two environments.

Tool-local inputs use `bg-[var(--color-bg-light)]`, `text-[var(--color-text-gray)]`, `border-[var(--color-border-dark)]`, and `focus:border-[var(--color-primary)]`. Primary text is `text-[var(--color-text-white)]`. Selected and hovered rows use `bg-[var(--color-hover-bg)]`. These inputs stay in the tool. They are not new shared controls.

#### States

- **Loading.** `Spinner` in the list that is loading. `useToolStatus` shows `Loading solutions…`, `Loading tables…`, or `Loading lookups…`. During create, save, or delete, disable the actions. If a confirmation `Modal` is open, set it busy. `useToolStatus` shows `Creating lookup…`, `Saving lookup…`, or `Deleting lookup…`.
- **Empty.** No environment: the message in step 1, and status `No environment selected`. No unmanaged solutions: `DataTable` empty message `No unmanaged solutions`. No referencing tables: `No tables can be the referencing side`. No lookups: `No lookups on this table`, with **New lookup** still available. A search with no matches: `No matching rows`.
- **Success.** `useToast` success: `Lookup created`, `Lookup saved`, or `Lookup deleted`. After create or save, keep that lookup open. After delete, close the editor and refresh the lookup list. `useToolStatus` returns to the context line: solution, referencing table, and the open lookup name.
- **Error.** `useToast` type `error` with the failure text. Keep the user's edits. A failed list shows that text in the column and a `Button` **Retry**. Status returns to the context line after the toast.

#### Shared controls

- `Button` — New lookup, Create lookup, Save, Cancel, Delete, Retry, and the modal actions.
- `Checkbox` — referenced-table selection and Advanced Find visibility.
- `DataTable` — unmanaged solutions, referencing tables, existing lookups, and referenced tables.
- `Modal` — discard unsaved edits, confirm relationship removal, and confirm lookup deletion.
- `SearchInput` — filter each table.
- `Spinner` — list loads and in-flight writes.
- `Toast` and `useToast` — success and error.
- `useToolStatus` — the status strings above. The tool does not choose status ids.
- `ProgressBar` is unused. Create, save, and delete are single actions.

#### What not to build

- A File, Edit, View, or Help command for this tool.
- A second tab, or any compare, copy, or sync across environments.
- Creating or editing solutions, publishers, or tables, or typing a publisher prefix by hand.
- A lookup aimed at fewer than two referenced tables, or turning one into a single-target lookup. Removing the column is Delete.
- Form, view, or app placement of the column, a relationship diagram, or a metadata browser beyond the two table lists.
- Bulk create, bulk delete, or import and export.
- A shared select, text field, or any new control in `desktop/src/ui/shared/ui`.
- `ProgressBar`, a wizard, or another window.
- XrmToolBox chrome, the plugin WinForms layout, its icon, or its copy.

### Implementation notes and test evidence

- Sidecar folder `api/PowerTools/PowerTools.API/Tools/PolymorphicLookup/`, registered from `Program.cs` with `DataverseContextFilter` and `DataverseClientFactory`. Endpoints: `GET /api/polymorphic-lookups/metadata`, `GET /api/polymorphic-lookups/solutions`, `POST /api/polymorphic-lookups`, `POST /api/polymorphic-lookups/relationships`, `PUT /api/polymorphic-lookups/relationships/{schemaName}`, `DELETE /api/polymorphic-lookups/relationships/{schemaName}`, and `DELETE /api/polymorphic-lookups/{entityLogicalName}/{attributeLogicalName}`.
- Desktop folder `desktop/src/ui/tools/polymorphic-lookup-creator/`, registered once in `desktop/src/ui/tools/registry.tsx`. Activity-bar tool, one tab, no title-bar command. Referencing tables use `CanBeRelatedEntityInRelationship`. Referenced tables use `CanBePrimaryEntityInRelationship`. Cascade is Assign, Merge, Reparent, Share, Unshare, and RollupView = NoCascade, and Delete = RemoveLink. Elastic tables show the helper text and do not change that cascade. Create and Save stay disabled until two referenced tables are checked. Unmanaged solutions are paged at 5,000 rows. `IsManaged`, `IsCustomizable`, `IsSolutionAware`, and `TableType` are requested. A solution-aware referencing table is refused before create. `SolutionUniqueName` is sent only on create lookup and add relationship. Fault `-2147192813` is `DuplicateAttributeSchemaName`. An edit runs add, then delete, then update, and stops on the first fault. No publish and no `AddSolutionComponent`.
- Sidecar tests: `dotnet test api/PowerTools/PowerTools.API.PolymorphicLookup.Tests/PowerTools.API.PolymorphicLookup.Tests.csproj -p:UseAppHost=false -p:OutputPath=D:\dev\PowerTools\tmp\poly-bin\` — 21 passed. The default API `bin` output was locked by a running sidecar, so the test build used that alternate output path.
- From `desktop/`, `npm run check` passed typecheck, `eslint . --max-warnings 0`, and `npm test` (51 files, 243 tests), and `vite build` succeeded. `npm run build` (`tsc -b && vite build`) passed. The first Playwright smoke run timed out after 120 seconds waiting for the Electron window at `http://localhost:5123/` while another Power Tools process was running. A later `npm run test:smoke:run` with port 5123 free passed: 1 test, 13.7s.

### Open questions

None.


