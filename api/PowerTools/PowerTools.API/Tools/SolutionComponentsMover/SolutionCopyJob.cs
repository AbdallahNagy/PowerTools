using System.Collections.Concurrent;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.SolutionComponentsMover;

public sealed class SolutionCopyJob
{
    private readonly object _gate = new();
    private readonly List<CopyEntryDto> _entries = [];

    private SolutionCopyJob(DataverseConnectionContext connection, PreparedCopy prepared)
    {
        Connection = connection;
        OrganizationMajor = prepared.OrganizationMajor;
        Components = prepared.Components;
        Targets = prepared.TargetUniqueNames.ToList();

        if (prepared.RefusalMessage is not null)
        {
            Status = "refused";
            Failed = 1;
            _entries.Add(new CopyEntryDto
            {
                ComponentType = SolutionComponentsMoverLimits.EntityComponentType,
                Label = prepared.RefusalLabel,
                Succeeded = false,
                Message = prepared.RefusalMessage,
            });
            return;
        }

        Total = Components.Count * Targets.Count;
        Status = Total == 0 ? "completed" : "queued";
    }

    public Guid Id { get; } = Guid.NewGuid();
    public DataverseConnectionContext Connection { get; }
    public int OrganizationMajor { get; }
    public IReadOnlyList<CopyComponent> Components { get; }
    public IReadOnlyList<string> Targets { get; }
    public string Status { get; private set; }
    public int Total { get; private set; }
    public int Processed { get; private set; }
    public int Succeeded { get; private set; }
    public int Failed { get; private set; }

    public static SolutionCopyJob Create(PreparedCopy prepared, DataverseConnectionContext connection) =>
        new(connection, prepared);

    public void MarkRunning()
    {
        lock (_gate)
        {
            if (Status == "queued") Status = "running";
        }
    }

    public void MarkCompleted()
    {
        lock (_gate)
        {
            if (Status is "queued" or "running") Status = "completed";
        }
    }

    public void MarkStopped()
    {
        lock (_gate)
        {
            if (Status is "queued" or "running") Status = "stopped";
        }
    }

    public void MarkFaulted(string message)
    {
        lock (_gate)
        {
            if (Status is "completed" or "refused" or "stopped") return;
            Status = "stopped";
            Failed++;
            Processed++;
            _entries.Add(new CopyEntryDto
            {
                Succeeded = false,
                Message = message,
                Label = "Copy",
            });
        }
    }

    public void RecordSuccess(CopyEntryDto entry)
    {
        lock (_gate)
        {
            _entries.Add(entry);
            Processed++;
            Succeeded++;
        }
    }

    public void RecordFailure(CopyEntryDto entry)
    {
        lock (_gate)
        {
            _entries.Add(entry);
            Processed++;
            Failed++;
        }
    }

    public CopyJobDto ToDto()
    {
        lock (_gate)
        {
            return new CopyJobDto
            {
                Status = Status,
                Processed = Processed,
                Total = Total,
                Succeeded = Succeeded,
                Failed = Failed,
                Entries = _entries.ToList(),
            };
        }
    }
}

public interface ISolutionCopyJobStore
{
    Guid Save(PreparedCopy prepared, DataverseConnectionContext connection);
    SolutionCopyJob? Get(Guid id);
    SolutionCopyJob? DequeueNext();
}

public sealed class InMemorySolutionCopyJobStore : ISolutionCopyJobStore
{
    private readonly ConcurrentDictionary<Guid, SolutionCopyJob> _jobs = new();
    private readonly ConcurrentQueue<Guid> _queue = new();

    public Guid Save(PreparedCopy prepared, DataverseConnectionContext connection)
    {
        var job = SolutionCopyJob.Create(prepared, connection);
        _jobs[job.Id] = job;
        if (job.Status == "queued")
            _queue.Enqueue(job.Id);
        return job.Id;
    }

    public SolutionCopyJob? Get(Guid id) =>
        _jobs.GetValueOrDefault(id);

    public SolutionCopyJob? DequeueNext()
    {
        while (_queue.TryDequeue(out var id))
        {
            if (_jobs.TryGetValue(id, out var job) && job.Status == "queued")
                return job;
        }

        return null;
    }
}

public static class SolutionCopyJobs
{
    public static (int Status, CopyJobDto? Body) Read(ISolutionCopyJobStore store, Guid jobId)
    {
        var job = store.Get(jobId);
        return job is null
            ? (StatusCodes.Status404NotFound, null)
            : (StatusCodes.Status200OK, job.ToDto());
    }
}
