using System.Collections.Concurrent;
using Dyno.Api.Services;

namespace Dyno.Api.Tools.DataMigration;

public enum MigrationJobStatus { Queued, Running, Completed, Failed }

public record MigrationJobError(string RecordId, string Message);

/// <summary>What one migration copies: a table, its columns, the source filter and the options.</summary>
public sealed record MigrationRequest(
    string EntityLogicalName,
    IReadOnlyList<string> Attributes,
    string? FetchXmlFilter,
    MigrationOptions Options);

public sealed class MigrationJob
{
    public Guid Id { get; } = Guid.NewGuid();

    // Captured auth context so the background runner can make requests.
    public required DataverseConnectionContext SourceConnection { get; init; }
    public required DataverseConnectionContext TargetConnection { get; init; }

    public required MigrationRequest Request { get; init; }
    public MigrationProgress Progress { get; } = new();
}

public interface IMigrationJobStore
{
    MigrationJob Enqueue(MigrationJob job);
    MigrationJob? Get(Guid id);
    MigrationJob? DequeueNext();
}

public class InMemoryMigrationJobStore : IMigrationJobStore
{
    private readonly ConcurrentDictionary<Guid, MigrationJob> _jobs = new();
    private readonly ConcurrentQueue<Guid> _queue = new();

    public MigrationJob Enqueue(MigrationJob job)
    {
        _jobs[job.Id] = job;
        _queue.Enqueue(job.Id);
        return job;
    }

    public MigrationJob? Get(Guid id) =>
        _jobs.GetValueOrDefault(id);

    public MigrationJob? DequeueNext()
    {
        while (_queue.TryDequeue(out var id))
        {
            if (_jobs.TryGetValue(id, out var job) &&
                job.Progress.Status == MigrationJobStatus.Queued)
                return job;
        }
        return null;
    }
}
