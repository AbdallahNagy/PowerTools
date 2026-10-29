using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.DataMigration;

/// <summary>Record lookups shared by the preview endpoints and the migration runner.</summary>
public static class DataMigrationRecords
{
    private const int CountPageSize = 5000;
    // Keeps each "in" condition well under the SQL parameter limit.
    private const int IdLookupChunkSize = 1000;

    public static async Task<EntityMetadata> GetEntityMetadataAsync(
        IOrganizationServiceAsync2 svc,
        string entityLogicalName)
    {
        var response = (RetrieveEntityResponse)await svc.ExecuteAsync(new RetrieveEntityRequest
        {
            LogicalName = entityLogicalName,
            EntityFilters = EntityFilters.Entity
        });
        return response.EntityMetadata;
    }

    /// <summary>
    /// Counts the records matching the filter. Aggregate queries stop at 50,000 records,
    /// so larger tables are counted by paging through their ids.
    /// </summary>
    public static async Task<int> CountAsync(
        IOrganizationServiceAsync2 svc,
        string entityLogicalName,
        string primaryIdAttribute,
        string? filterFragment,
        CancellationToken ct = default)
    {
        var countFetch = DataMigrationFetchXml.BuildCount(entityLogicalName, primaryIdAttribute, filterFragment);
        try
        {
            var aggregate = await svc.RetrieveMultipleAsync(new FetchExpression(countFetch), ct);
            var value = aggregate.Entities.FirstOrDefault()
                ?.GetAttributeValue<AliasedValue>(DataMigrationFetchXml.CountAlias)?.Value;
            return Convert.ToInt32(value ?? 0);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Usually the aggregate record limit. Paging below surfaces any other error.
        }

        var count = 0;
        var page = 1;
        string? pagingCookie = null;
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var fetch = DataMigrationFetchXml.Build(
                entityLogicalName,
                [primaryIdAttribute],
                filterFragment,
                page,
                CountPageSize,
                pagingCookie);
            var result = await svc.RetrieveMultipleAsync(new FetchExpression(fetch), ct);
            count += result.Entities.Count;

            if (!result.MoreRecords) return count;
            pagingCookie = result.PagingCookie;
            page++;
        }
    }

    /// <summary>
    /// Counts the source records matching the filter and how many of them already
    /// exist in the target, by paging through the source ids.
    /// </summary>
    public static async Task<(int Total, int Existing)> CountInTargetAsync(
        IOrganizationServiceAsync2 sourceSvc,
        IOrganizationServiceAsync2 targetSvc,
        string entityLogicalName,
        string sourcePrimaryIdAttribute,
        string targetPrimaryIdAttribute,
        string? filterFragment,
        CancellationToken ct = default)
    {
        var total = 0;
        var existing = 0;
        var page = 1;
        string? pagingCookie = null;
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var fetch = DataMigrationFetchXml.Build(
                entityLogicalName,
                [sourcePrimaryIdAttribute],
                filterFragment,
                page,
                CountPageSize,
                pagingCookie);
            var result = await sourceSvc.RetrieveMultipleAsync(new FetchExpression(fetch), ct);
            total += result.Entities.Count;

            if (result.Entities.Count > 0)
            {
                var found = await FindExistingIdsAsync(
                    targetSvc,
                    entityLogicalName,
                    targetPrimaryIdAttribute,
                    result.Entities.Select(e => e.Id).ToList(),
                    ct);
                existing += found.Count;
            }

            if (!result.MoreRecords) return (total, existing);
            pagingCookie = result.PagingCookie;
            page++;
        }
    }

    /// <summary>
    /// Target records whose id is not among the source records matching the filter:
    /// the records the delete option removes. As in XrmToolBox Data Transporter, the
    /// filter only selects source records. Every target record of the table is
    /// compared, so a target record outside the filter is deleted too, even when the
    /// source has it.
    /// </summary>
    public static async Task<(int SourceCount, List<MissingRecord> Records)> FindTargetRecordsMissingFromSourceAsync(
        IOrganizationServiceAsync2 sourceSvc,
        IOrganizationServiceAsync2 targetSvc,
        string entityLogicalName,
        string sourcePrimaryIdAttribute,
        EntityMetadata targetMetadata,
        string? filterFragment,
        CancellationToken ct = default)
    {
        var sourceCount = await CountAsync(sourceSvc, entityLogicalName, sourcePrimaryIdAttribute, filterFragment, ct);

        var nameAttribute = targetMetadata.PrimaryNameAttribute;
        var columns = string.IsNullOrEmpty(nameAttribute)
            ? [targetMetadata.PrimaryIdAttribute]
            : new List<string> { targetMetadata.PrimaryIdAttribute, nameAttribute };
        var missing = new List<MissingRecord>();
        var page = 1;
        string? pagingCookie = null;
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var fetch = DataMigrationFetchXml.Build(
                entityLogicalName, columns, filterFragment: null, page, CountPageSize, pagingCookie);
            var result = await targetSvc.RetrieveMultipleAsync(new FetchExpression(fetch), ct);

            if (result.Entities.Count > 0)
            {
                var inSource = await FindExistingIdsAsync(
                    sourceSvc,
                    entityLogicalName,
                    sourcePrimaryIdAttribute,
                    result.Entities.Select(e => e.Id).ToList(),
                    ct,
                    filterFragment);
                missing.AddRange(result.Entities
                    .Where(e => !inSource.Contains(e.Id))
                    .Select(e => new MissingRecord(
                        e.Id,
                        string.IsNullOrEmpty(nameAttribute) ? null : e.GetAttributeValue<object>(nameAttribute)?.ToString())));
            }

            if (!result.MoreRecords) return (sourceCount, missing);
            pagingCookie = result.PagingCookie;
            page++;
        }
    }

    /// <summary>
    /// Returns the ids that already exist in the given environment, and also match
    /// the filter when one is given.
    /// </summary>
    public static async Task<HashSet<Guid>> FindExistingIdsAsync(
        IOrganizationServiceAsync2 svc,
        string entityLogicalName,
        string primaryIdAttribute,
        IReadOnlyCollection<Guid> ids,
        CancellationToken ct = default,
        string? filterFragment = null)
    {
        var existing = new HashSet<Guid>();
        foreach (var chunk in ids.Distinct().Chunk(IdLookupChunkSize))
        {
            var fetch = DataMigrationFetchXml.BuildIdLookup(entityLogicalName, primaryIdAttribute, chunk, filterFragment);
            var result = await svc.RetrieveMultipleAsync(new FetchExpression(fetch), ct);
            existing.UnionWith(result.Entities.Select(e => e.Id));
        }
        return existing;
    }
}

public record MissingRecord(Guid Id, string? Name);
