using System.Collections.Concurrent;
using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;

namespace Dyno.Api.Tools.Agent.Kernel;

/// <summary>
/// What one environment can do. Planners ask this instead of branching on online or on-premises, so one code path
/// serves both: a missing feature becomes an unsupported step that names the route that works.
/// </summary>
public sealed record Capabilities(string Version, IReadOnlySet<string> Tables, bool ExportSolutionAsync)
{
    /// <summary>Feature tables probed once per connection. Each one marks a feature some environments lack.</summary>
    public static readonly IReadOnlyList<string> FeatureTables =
    [
        "appaction",              // modern commands (online)
        "customapi",              // Custom APIs (newer versions)
        "pluginpackage",          // NuGet plug-in packages (online)
        "connectionreference",    // connection references (online)
        "msdyn_componentlayer",   // solution layers
        "environmentvariabledefinition",
        "fileattachment",         // file storage for file and image columns
    ];

    public bool HasTable(string logicalName) => Tables.Contains(logicalName);

    public Version? ParsedVersion => System.Version.TryParse(Version, out var parsed) ? parsed : null;

    /// <summary>Reads the version, the feature tables and the export message. Only SDK messages, so it works on both.</summary>
    public static async Task<Capabilities> ProbeAsync(IAgentClient client, CancellationToken ct)
    {
        var version = (RetrieveVersionResponse)await client.ExecuteAsync(new RetrieveVersionRequest(), ct);
        var tables = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var table in FeatureTables)
        {
            if (await TableExistsAsync(client, table, ct)) tables.Add(table);
        }

        return new Capabilities(version.Version ?? "", tables, await MessageExistsAsync(client, "ExportSolutionAsync", ct));
    }

    private static async Task<bool> TableExistsAsync(IAgentClient client, string table, CancellationToken ct)
    {
        try
        {
            await client.ExecuteAsync(new RetrieveEntityRequest { LogicalName = table, EntityFilters = EntityFilters.Entity }, ct);
            return true;
        }
        catch (Exception ex) when (RetryPolicy.FindFault(ex) is { } fault && !RetryPolicy.ServiceProtectionCodes.Contains(fault.ErrorCode))
        {
            // A missing table is a fault; its code differs between versions, so any fault but throttling means "missing".
            return false;
        }
    }

    private static async Task<bool> MessageExistsAsync(IAgentClient client, string message, CancellationToken ct)
    {
        var query = new QueryExpression("sdkmessage") { TopCount = 1, ColumnSet = new ColumnSet("name"), NoLock = true };
        query.Criteria.AddCondition("name", ConditionOperator.Equal, message);
        return (await client.RetrieveMultipleAsync(query, ct)).Entities.Count > 0;
    }
}

public interface ICapabilitiesCache
{
    Task<Capabilities> GetAsync(string connectionKey, IAgentClient client, CancellationToken ct);

    void Forget(string connectionKey);
}

/// <summary>Probes a connection once and keeps the answer for an hour, keyed like the solution layers cache.</summary>
public sealed class CapabilitiesCache(TimeProvider? time = null, TimeSpan? lifetime = null) : ICapabilitiesCache
{
    private readonly TimeProvider time = time ?? TimeProvider.System;
    private readonly TimeSpan lifetime = lifetime ?? TimeSpan.FromHours(1);
    private readonly ConcurrentDictionary<string, (DateTimeOffset At, Capabilities Value)> entries = new(StringComparer.Ordinal);

    public async Task<Capabilities> GetAsync(string connectionKey, IAgentClient client, CancellationToken ct)
    {
        if (entries.TryGetValue(connectionKey, out var entry) && time.GetUtcNow() - entry.At < lifetime) return entry.Value;
        var value = await Capabilities.ProbeAsync(client, ct);
        entries[connectionKey] = (time.GetUtcNow(), value);
        return value;
    }

    public void Forget(string connectionKey) => entries.TryRemove(connectionKey, out _);
}
