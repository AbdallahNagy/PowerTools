using System.Collections.Concurrent;

namespace PowerTools.API.Services;

public enum MigrationJobStatus { Queued, Running, Completed, Failed }

public record MigrationJobError(string RecordId, string Message);

public class MigrationJob
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public MigrationJobStatus Status { get; set; } = MigrationJobStatus.Queued;
    public int Total { get; set; }
    public int Processed { get; set; }
    public int Succeeded { get; set; }
    public int Failed { get; set; }
    public List<MigrationJobError> Errors { get; set; } = [];

    // Captured auth context so the background runner can make requests
    public required string SourceToken { get; init; }
    public required string SourceEnvUrl { get; init; }
    public required string TargetToken { get; init; }
    public required string TargetEnvUrl { get; init; }

    // Migration parameters
    public required string EntityLogicalName { get; init; }
    public required List<string> Attributes { get; init; }
    public string? FetchXmlFilter { get; init; }
    public required string Mode { get; init; } // "create" | "update" | "upsert"
    public string? MatchAttribute { get; init; }
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
    private readonly System.Collections.Concurrent.ConcurrentQueue<Guid> _queue = new();

    public MigrationJob Enqueue(MigrationJob job)
    {
        _jobs[job.Id] = job;
        _queue.Enqueue(job.Id);
        return job;
    }

    public MigrationJob? Get(Guid id) =>
        _jobs.TryGetValue(id, out var job) ? job : null;

    public MigrationJob? DequeueNext()
    {
        while (_queue.TryDequeue(out var id))
        {
            if (_jobs.TryGetValue(id, out var job) &&
                job.Status == MigrationJobStatus.Queued)
                return job;
        }
        return null;
    }
}
