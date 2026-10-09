using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Metadata;

namespace PowerTools.API.Tools.Translator;

/// <summary>The table list, the solution source, and the solution an apply adds components to.</summary>
public sealed partial class TranslatorService
{
    /// <summary>
    /// Tables for the scope list. With a solution, a table is listed when the table itself or any of its
    /// columns, relationships, views, or charts is in the solution.
    /// </summary>
    public async Task<TranslatorResult<TablesResponse>> GetTablesAsync(Guid? solutionId, CancellationToken cancellationToken)
    {
        try
        {
            var baseLcid = await client.RetrieveBaseLanguageAsync(cancellationToken);
            var all = await client.RetrieveMetadataAsync(TranslatorSolutionQueries.TableSummaries(baseLcid), cancellationToken);
            IEnumerable<EntityMetadata> visible = all.Where(table =>
                !string.IsNullOrEmpty(table.LogicalName) && table.IsIntersect != true && table.IsPrivate != true);

            if (solutionId is { } id)
            {
                var scope = await LoadScopeAsync(id, cancellationToken);
                var names = await SolutionTableNamesAsync(scope, all, cancellationToken);
                visible = visible.Where(table => names.Contains(table.LogicalName));
            }

            var tables = visible
                .Select(table => new TableSummaryDto(
                    table.LogicalName,
                    TranslatorMapper.BaseText(table.DisplayName, baseLcid, table.LogicalName)))
                .OrderBy(table => table.DisplayName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(table => table.LogicalName, StringComparer.Ordinal)
                .ToList();
            return TranslatorResult<TablesResponse>.Ok(new TablesResponse(tables));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return TranslatorResult<TablesResponse>.Fail(TranslatorFaults.From(ex));
        }
    }

    /// <summary>Visible solutions, managed and unmanaged, except Default and Active.</summary>
    public async Task<TranslatorResult<SolutionsResponse>> GetSolutionsAsync(CancellationToken cancellationToken)
    {
        try
        {
            var rows = await client.RetrieveAllPagesAsync(TranslatorSolutionQueries.Solutions(), cancellationToken);
            var solutions = rows
                .Select(row => new SolutionDto(
                    row.Id,
                    row.GetAttributeValue<string>("uniquename") ?? "",
                    Text(row, "friendlyname") ?? row.GetAttributeValue<string>("uniquename") ?? "",
                    row.GetAttributeValue<string>("version"),
                    row.GetAttributeValue<bool>("ismanaged"),
                    row.GetAttributeValue<EntityReference>("publisherid")?.Name))
                .Where(solution => solution.UniqueName.Length > 0 && !TranslatorSolutionValidation.IsHidden(solution.UniqueName))
                .ToList();
            return TranslatorResult<SolutionsResponse>.Ok(new SolutionsResponse(solutions));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return TranslatorResult<SolutionsResponse>.Fail(TranslatorFaults.From(ex));
        }
    }

    /// <summary>Publishers that are not read-only.</summary>
    public async Task<TranslatorResult<PublishersResponse>> GetPublishersAsync(CancellationToken cancellationToken)
    {
        try
        {
            var rows = await client.RetrieveAllPagesAsync(TranslatorSolutionQueries.Publishers(), cancellationToken);
            var publishers = rows
                .Select(row => new PublisherDto(
                    row.Id,
                    row.GetAttributeValue<string>("uniquename") ?? "",
                    Text(row, "friendlyname") ?? row.GetAttributeValue<string>("uniquename") ?? "",
                    row.GetAttributeValue<string>("customizationprefix")))
                .Where(publisher => publisher.UniqueName.Length > 0)
                .ToList();
            return TranslatorResult<PublishersResponse>.Ok(new PublishersResponse(publishers));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return TranslatorResult<PublishersResponse>.Fail(TranslatorFaults.From(ex));
        }
    }

    public async Task<SolutionScope> LoadScopeAsync(Guid solutionId, CancellationToken cancellationToken) =>
        SolutionScope.From(await client.RetrieveAllPagesAsync(TranslatorSolutionQueries.Components(solutionId), cancellationToken));

    private async Task<HashSet<string>> SolutionTableNamesAsync(
        SolutionScope scope,
        IReadOnlyList<EntityMetadata> all,
        CancellationToken cancellationToken)
    {
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var table in all)
        {
            if (scope.IncludesTable(table.MetadataId) && !string.IsNullOrEmpty(table.LogicalName))
                names.Add(table.LogicalName);
        }

        var attributeIds = scope.Attributes.ToList();
        var relationshipIds = scope.Relationships.ToList();
        var size = TranslatorSolutionQueries.IdChunkSize;
        for (var start = 0; start < Math.Max(attributeIds.Count, relationshipIds.Count); start += size)
        {
            var attributes = attributeIds.Skip(start).Take(size).ToList();
            var relationships = relationshipIds.Skip(start).Take(size).ToList();
            var owners = await client.RetrieveMetadataAsync(
                TranslatorSolutionQueries.ComponentTables(attributes, relationships),
                cancellationToken);
            foreach (var table in owners)
            {
                if ((table.Attributes ?? []).Any(attribute => SolutionScope.Contains(scope.Attributes, attribute.MetadataId)))
                    names.Add(table.LogicalName);

                // A 1:N menu label shows on the referenced table; an N:N shows on both tables.
                foreach (var relationship in table.OneToManyRelationships ?? [])
                {
                    if (SolutionScope.Contains(scope.Relationships, relationship.MetadataId))
                        names.Add(relationship.ReferencedEntity ?? table.LogicalName);
                }

                foreach (var relationship in table.ManyToManyRelationships ?? [])
                {
                    if (!SolutionScope.Contains(scope.Relationships, relationship.MetadataId)) continue;
                    if (!string.IsNullOrEmpty(relationship.Entity1LogicalName)) names.Add(relationship.Entity1LogicalName);
                    if (!string.IsNullOrEmpty(relationship.Entity2LogicalName)) names.Add(relationship.Entity2LogicalName);
                }
            }
        }

        await AddRecordTablesAsync(names, scope.Views, "savedquery", "savedqueryid", "returnedtypecode", cancellationToken);
        await AddRecordTablesAsync(names, scope.Charts, "savedqueryvisualization", "savedqueryvisualizationid", "primaryentitytypecode", cancellationToken);
        names.Remove("");
        return names;
    }

    private async Task AddRecordTablesAsync(
        HashSet<string> names,
        HashSet<Guid> ids,
        string entityName,
        string idAttribute,
        string tableAttribute,
        CancellationToken cancellationToken)
    {
        var all = ids.ToList();
        for (var start = 0; start < all.Count; start += TranslatorSolutionQueries.IdChunkSize)
        {
            var chunk = all.Skip(start).Take(TranslatorSolutionQueries.IdChunkSize).ToList();
            var records = await client.RetrieveAllPagesAsync(
                TranslatorSolutionQueries.RecordsById(entityName, idAttribute, tableAttribute, chunk),
                cancellationToken);
            foreach (var record in records.Where(record => ids.Contains(record.Id)))
                names.Add(TableOf(record, tableAttribute));
        }
    }

    /// <summary>The tables (of those queried) that were added with all subcomponents.</summary>
    private async Task<IReadOnlySet<string>> FullTablesAsync(
        SolutionScope scope,
        IReadOnlyList<string> tables,
        IReadOnlyCollection<int> lcids,
        CancellationToken cancellationToken)
    {
        var full = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!scope.Tables.Values.Contains(SolutionComponentTypes.IncludeSubcomponents) || tables.Count == 0) return full;

        for (var start = 0; start < tables.Count; start += TranslatorRequests.MetadataChunkSize)
        {
            var chunk = tables.Skip(start).Take(TranslatorRequests.MetadataChunkSize).ToList();
            var metadata = await client.RetrieveMetadataAsync(TranslatorRequests.Metadata(chunk, lcids, false, false), cancellationToken);
            foreach (var table in metadata.Where(table => scope.IncludesAll(table.MetadataId)))
                full.Add(table.LogicalName);
        }

        return full;
    }

    private static HashSet<string> InScopeColumns(EntityMetadata table, SolutionScope scope) =>
        (table.Attributes ?? [])
            .Where(attribute => SolutionScope.Contains(scope.Attributes, attribute.MetadataId) && attribute.LogicalName is not null)
            .Select(attribute => attribute.LogicalName)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

    private static HashSet<string> InScopeRelationships(EntityMetadata table, SolutionScope scope) =>
        (table.OneToManyRelationships ?? []).Cast<RelationshipMetadataBase>()
            .Concat(table.ManyToManyRelationships ?? [])
            .Where(relationship => SolutionScope.Contains(scope.Relationships, relationship.MetadataId) && relationship.SchemaName is not null)
            .Select(relationship => relationship.SchemaName)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Checks the target solution before any label is written: an existing solution must be visible and
    /// unmanaged; a new one needs valid fields, a publisher that is not read-only, and a free unique name.
    /// </summary>
    public async Task<TranslatorResult<SolutionTarget>> ResolveSolutionTargetAsync(
        ApplySolutionDto body,
        CancellationToken cancellationToken)
    {
        var existing = body.UniqueName?.Trim();
        if (string.IsNullOrEmpty(existing) == (body.New is null))
            return Fail("Choose an existing solution or describe a new one, not both.");

        try
        {
            if (body.New is null)
            {
                if (TranslatorSolutionValidation.IsHidden(existing!))
                    return Fail($"Components cannot be added to the {existing} solution. Choose another solution.");
                var found = (await client.RetrieveAllPagesAsync(
                        TranslatorSolutionQueries.SolutionByUniqueName(existing!),
                        cancellationToken))
                    .FirstOrDefault();
                if (found is null || found.GetAttributeValue<bool?>("isvisible") == false)
                    return Fail($"The solution \"{existing}\" was not found.");
                if (found.GetAttributeValue<bool>("ismanaged"))
                    return Fail($"\"{existing}\" is a managed solution. Choose an unmanaged solution.");
                var uniqueName = found.GetAttributeValue<string>("uniquename") ?? existing!;
                return TranslatorResult<SolutionTarget>.Ok(new SolutionTarget(
                    uniqueName,
                    Text(found, "friendlyname") ?? uniqueName,
                    null));
            }

            var problem = TranslatorSolutionValidation.NewSolutionProblem(body.New);
            if (problem is not null) return Fail(problem);

            var plan = new NewSolutionPlan(
                body.New.UniqueName!.Trim(),
                body.New.FriendlyName!.Trim(),
                body.New.PublisherId!.Value,
                string.IsNullOrWhiteSpace(body.New.Version) ? TranslatorSolutionValidation.DefaultVersion : body.New.Version.Trim());

            var publisher = (await client.RetrieveAllPagesAsync(
                    TranslatorSolutionQueries.PublisherById(plan.PublisherId),
                    cancellationToken))
                .FirstOrDefault();
            if (publisher is null) return Fail("The selected publisher was not found.");
            if (publisher.GetAttributeValue<bool>("isreadonly"))
                return Fail("The selected publisher is read-only. Choose another publisher.");

            var taken = await client.RetrieveAllPagesAsync(
                TranslatorSolutionQueries.SolutionByUniqueName(plan.UniqueName),
                cancellationToken);
            if (taken.Count > 0) return Fail($"A solution with the unique name \"{plan.UniqueName}\" already exists.");

            return TranslatorResult<SolutionTarget>.Ok(new SolutionTarget(plan.UniqueName, plan.FriendlyName, plan));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return TranslatorResult<SolutionTarget>.Fail(TranslatorFaults.From(ex));
        }

        static TranslatorResult<SolutionTarget> Fail(string message) =>
            TranslatorResult<SolutionTarget>.Fail(TranslatorFaults.Invalid(message));
    }

    private static string? Text(Entity row, string attribute)
    {
        var value = row.GetAttributeValue<string>(attribute);
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
