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

    /// <summary>Returns the ids that already exist in the given environment.</summary>
    public static async Task<HashSet<Guid>> FindExistingIdsAsync(
        IOrganizationServiceAsync2 svc,
        string entityLogicalName,
        string primaryIdAttribute,
        IReadOnlyCollection<Guid> ids,
        CancellationToken ct = default)
    {
        var existing = new HashSet<Guid>();
        foreach (var chunk in ids.Distinct().Chunk(IdLookupChunkSize))
        {
            var fetch = DataMigrationFetchXml.BuildIdLookup(entityLogicalName, primaryIdAttribute, chunk);
            var result = await svc.RetrieveMultipleAsync(new FetchExpression(fetch), ct);
            existing.UnionWith(result.Entities.Select(e => e.Id));
        }
        return existing;
    }
}
