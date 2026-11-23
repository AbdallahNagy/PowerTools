using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;

namespace Dyno.Api.Tools.DataMigration;

/// <summary>
/// One table on one Dataverse connection, with the record lookups the preview routes and the migration run share.
/// Records are matched by id across connections, as in XrmToolBox Data Transporter.
/// </summary>
public sealed class DataMigrationTable
{
    private const int CountPageSize = 5000;
    // Keeps each "in" condition well under the SQL parameter limit.
    private const int IdLookupChunkSize = 1000;

    private readonly IDataMigrationClient _client;

    private DataMigrationTable(IDataMigrationClient client, string logicalName, EntityMetadata metadata)
    {
        _client = client;
        LogicalName = logicalName;
        PrimaryIdAttribute = metadata.PrimaryIdAttribute;
        PrimaryNameAttribute = string.IsNullOrEmpty(metadata.PrimaryNameAttribute) ? null : metadata.PrimaryNameAttribute;
    }

    public string LogicalName { get; }
    public string PrimaryIdAttribute { get; }
    public string? PrimaryNameAttribute { get; }

    /// <summary>Reads the table's metadata. Throws the Dataverse error when the table cannot be read.</summary>
    public static async Task<DataMigrationTable> OpenAsync(
        IDataMigrationClient client,
        string logicalName,
        CancellationToken ct = default)
    {
        var response = (RetrieveEntityResponse)await client.ExecuteAsync(new RetrieveEntityRequest
        {
            LogicalName = logicalName,
            EntityFilters = EntityFilters.Entity
        }, ct);
        return new DataMigrationTable(client, logicalName, response.EntityMetadata);
    }

    /// <summary>One page of the records matching the filter, by id and primary name.</summary>
    public async Task<RecordPage> PreviewPageAsync(
        string? filterFragment,
        int page,
        int pageSize,
        string? pagingCookie,
        CancellationToken ct = default)
    {
        var fetchXml = DataMigrationFetchXml.Build(
            LogicalName,
            [PrimaryNameAttribute ?? PrimaryIdAttribute],
            filterFragment,
            page,
            pageSize,
            pagingCookie);
        var result = await _client.RetrieveMultipleAsync(new FetchExpression(fetchXml), ct);
        return new RecordPage(
            result.Entities.Select(e => new MissingRecord(e.Id, Name(e))).ToList(),
            result.PagingCookie,
            result.MoreRecords);
    }

    /// <summary>
    /// Counts the records matching the filter. Aggregate queries stop at 50,000 records,
    /// so larger tables are counted by paging through their ids.
    /// </summary>
    public async Task<int> CountAsync(string? filterFragment, CancellationToken ct = default)
    {
        var countFetch = DataMigrationFetchXml.BuildCount(LogicalName, PrimaryIdAttribute, filterFragment);
        try
        {
            var aggregate = await _client.RetrieveMultipleAsync(new FetchExpression(countFetch), ct);
            var value = aggregate.Entities.FirstOrDefault()
                ?.GetAttributeValue<AliasedValue>(DataMigrationFetchXml.CountAlias)?.Value;
            return Convert.ToInt32(value ?? 0);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Usually the aggregate record limit. Paging below surfaces any other error.
        }

        var count = 0;
        await foreach (var page in PagesAsync([PrimaryIdAttribute], filterFragment, CountPageSize, ct))
        {
            count += page.Count;
        }
        return count;
    }

    /// <summary>
    /// Counts the records matching the filter and how many of them already exist in
    /// <paramref name="target"/>, by paging through the ids.
    /// </summary>
    public async Task<(int Total, int Existing)> CountInTargetAsync(
        DataMigrationTable target,
        string? filterFragment,
        CancellationToken ct = default)
    {
        var total = 0;
        var existing = 0;
        await foreach (var page in PagesAsync([PrimaryIdAttribute], filterFragment, CountPageSize, ct))
        {
            total += page.Count;
            if (page.Count == 0) continue;
            var found = await target.ExistingIdsAsync(page.Select(e => e.Id).ToList(), ct);
            existing += found.Count;
        }
        return (total, existing);
    }

    /// <summary>
    /// Records of this table whose id is not among the records of <paramref name="source"/> matching the
    /// filter: the records the delete option removes. As in XrmToolBox Data Transporter, the filter only
    /// selects source records. Every record of this table is compared, so a record outside the filter is
    /// deleted too, even when the source has it.
    /// </summary>
    public async Task<(int SourceCount, List<MissingRecord> Records)> MissingFromSourceAsync(
        DataMigrationTable source,
        string? filterFragment,
        CancellationToken ct = default)
    {
        var sourceCount = await source.CountAsync(filterFragment, ct);

        IReadOnlyCollection<string> columns = PrimaryNameAttribute is null
            ? [PrimaryIdAttribute]
            : [PrimaryIdAttribute, PrimaryNameAttribute];
        var missing = new List<MissingRecord>();
        await foreach (var page in PagesAsync(columns, filterFragment: null, CountPageSize, ct))
        {
            if (page.Count == 0) continue;
            var inSource = await source.ExistingIdsAsync(page.Select(e => e.Id).ToList(), ct, filterFragment);
            missing.AddRange(page
                .Where(e => !inSource.Contains(e.Id))
                .Select(e => new MissingRecord(e.Id, Name(e))));
        }
        return (sourceCount, missing);
    }

    /// <summary>
    /// Returns the ids that already exist in this table, and also match the filter when one is given.
    /// </summary>
    public async Task<HashSet<Guid>> ExistingIdsAsync(
        IReadOnlyCollection<Guid> ids,
        CancellationToken ct = default,
        string? filterFragment = null)
    {
        var existing = new HashSet<Guid>();
        foreach (var chunk in ids.Distinct().Chunk(IdLookupChunkSize))
        {
            var fetch = DataMigrationFetchXml.BuildIdLookup(LogicalName, PrimaryIdAttribute, chunk, filterFragment);
            var result = await _client.RetrieveMultipleAsync(new FetchExpression(fetch), ct);
            existing.UnionWith(result.Entities.Select(e => e.Id));
        }
        return existing;
    }

    private IAsyncEnumerable<DataCollection<Entity>> PagesAsync(
        IReadOnlyCollection<string> columns,
        string? filterFragment,
        int pageSize,
        CancellationToken ct) =>
        PagesAsync(_client, LogicalName, columns, filterFragment, pageSize, ct);

    /// <summary>
    /// Every record of the table matching the filter, one page at a time, with the given columns. It needs no
    /// metadata, so the migration reads source records without opening the source table.
    /// </summary>
    internal static async IAsyncEnumerable<DataCollection<Entity>> PagesAsync(
        IDataMigrationClient client,
        string logicalName,
        IReadOnlyCollection<string> columns,
        string? filterFragment,
        int pageSize,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        var page = 1;
        string? pagingCookie = null;
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var fetch = DataMigrationFetchXml.Build(logicalName, columns, filterFragment, page, pageSize, pagingCookie);
            var result = await client.RetrieveMultipleAsync(new FetchExpression(fetch), ct);
            yield return result.Entities;

            if (!result.MoreRecords) yield break;
            pagingCookie = result.PagingCookie;
            page++;
        }
    }

    private string? Name(Entity record) =>
        PrimaryNameAttribute is null ? null : record.GetAttributeValue<object>(PrimaryNameAttribute)?.ToString();
}

public record MissingRecord(Guid Id, string? Name);

public record RecordPage(IReadOnlyList<MissingRecord> Records, string? PagingCookie, bool MoreRecords);
