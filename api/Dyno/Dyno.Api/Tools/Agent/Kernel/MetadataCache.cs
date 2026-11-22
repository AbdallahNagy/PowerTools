using System.Collections.Concurrent;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;

namespace Dyno.Api.Tools.Agent.Kernel;

/// <summary>
/// Table metadata read once per call. A plan, its re-check and its verification are separate calls, so each reads
/// fresh metadata; inside one plan a table is read once. A missing table answers null.
/// </summary>
public sealed class MetadataCache(IAgentClient client)
{
    private readonly ConcurrentDictionary<string, Task<EntityMetadata?>> tables = new(StringComparer.OrdinalIgnoreCase);

    public Task<EntityMetadata?> TableAsync(string logicalName, CancellationToken ct) =>
        tables.GetOrAdd(logicalName, name => LoadAsync(name, ct));

    /// <summary>Drops what is known, after a step changed metadata.</summary>
    public void Clear() => tables.Clear();

    private async Task<EntityMetadata?> LoadAsync(string logicalName, CancellationToken ct)
    {
        try
        {
            var response = (RetrieveEntityResponse)await client.ExecuteAsync(
                new RetrieveEntityRequest
                {
                    LogicalName = logicalName,
                    // All, so alternate keys come too.
                    EntityFilters = EntityFilters.All,
                    RetrieveAsIfPublished = true,
                },
                ct);
            return response.EntityMetadata;
        }
        catch (Exception ex) when (RetryPolicy.FindFault(ex) is { } fault && !RetryPolicy.ServiceProtectionCodes.Contains(fault.ErrorCode))
        {
            return null;
        }
    }
}
