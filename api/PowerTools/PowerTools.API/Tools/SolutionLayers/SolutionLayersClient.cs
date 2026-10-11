using System.Collections.Concurrent;
using Microsoft.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace PowerTools.API.Tools.SolutionLayers;

public interface ISolutionLayersClient
{
    Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken);

    Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken);
}

public sealed class DataverseSolutionLayersClient(IOrganizationServiceAsync2 service) : ISolutionLayersClient
{
    public Task<EntityCollection> RetrieveMultipleAsync(QueryBase query, CancellationToken cancellationToken) =>
        service.RetrieveMultipleAsync(query, cancellationToken);

    public Task<OrganizationResponse> ExecuteAsync(OrganizationRequest request, CancellationToken cancellationToken) =>
        service.ExecuteAsync(request, cancellationToken);
}

/// <summary>
/// Per-connection cache for the component type definitions and the table and relationship
/// lists the picker searches in memory. Only successful reads are kept, for a few minutes.
/// </summary>
public interface ISolutionLayersCache
{
    Task<T> GetOrAddAsync<T>(string key, Func<Task<T>> read) where T : class;
}

public sealed class SolutionLayersCache(TimeProvider? timeProvider = null) : ISolutionLayersCache
{
    private readonly TimeProvider time = timeProvider ?? TimeProvider.System;
    private readonly ConcurrentDictionary<string, (DateTimeOffset Expires, object Value)> entries = new();

    public async Task<T> GetOrAddAsync<T>(string key, Func<Task<T>> read) where T : class
    {
        var now = time.GetUtcNow();
        if (entries.TryGetValue(key, out var entry) && entry.Expires > now && entry.Value is T cached)
            return cached;

        var value = await read();
        entries[key] = (now + SolutionLayersLimits.CacheLifetime, value);
        return value;
    }
}
