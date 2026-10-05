using System.Collections.Concurrent;
using System.Globalization;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.BulkWorkflowExecution;

public static class BulkWorkflowRunStatus
{
    public const string Collecting = "collecting";
    public const string Running = "running";
    public const string Cancelling = "cancelling";
    public const string Cancelled = "cancelled";
    public const string Completed = "completed";
    public const string Failed = "failed";
}

public static class BulkWorkflowEstimate
{
    /// <summary>
    /// Average batch duration (plus the configured delay) times the batches still to send.
    /// Null until the first batch has finished.
    /// </summary>
    public static int? SecondsRemaining(
        int completedBatches,
        TimeSpan batchTime,
        int remainingRecords,
        int batchSize,
        int delaySeconds)
    {
        if (completedBatches <= 0 || batchSize <= 0) return null;
        if (remainingRecords <= 0) return 0;
        var remainingBatches = (remainingRecords + batchSize - 1) / batchSize;
        var average = batchTime.TotalSeconds / completedBatches;
        return (int)Math.Ceiling(remainingBatches * average + remainingBatches * (double)delaySeconds);
    }
}

public sealed class BulkWorkflowJob
{
    private readonly object _gate = new();
    private readonly List<RunErrorDto> _errors = [];
    private readonly CancellationTokenSource _cancel = new();
    private int _completedBatches;
    private TimeSpan _batchTime;
    private string? _message;
    private bool _errorsCapped;

    public BulkWorkflowJob(PreparedRun run, DataverseConnectionContext connection, DateTimeOffset startedAt)
    {
        Run = run;
        Connection = connection;
        StartedAt = startedAt;
    }

    public Guid Id { get; } = Guid.NewGuid();
    public PreparedRun Run { get; }
    public DataverseConnectionContext Connection { get; }
    public DateTimeOffset StartedAt { get; }
    public string Status { get; private set; } = BulkWorkflowRunStatus.Collecting;
    public int Total { get; private set; }
    public int Processed { get; private set; }
    public int Succeeded { get; private set; }
    public int Failed { get; private set; }

    /// <summary>Cancelled when the user asks the run to stop. Cuts a delay between batches short.</summary>
    public CancellationToken StopToken => _cancel.Token;

    public bool StopRequested
    {
        get
        {
            lock (_gate) return Status == BulkWorkflowRunStatus.Cancelling;
        }
    }

    public bool IsFinished
    {
        get
        {
            lock (_gate) return IsEnd(Status);
        }
    }

    public void RequestCancel()
    {
        lock (_gate)
        {
            if (Status is not (BulkWorkflowRunStatus.Collecting or BulkWorkflowRunStatus.Running)) return;
            Status = BulkWorkflowRunStatus.Cancelling;
        }

        _cancel.Cancel();
    }

    public void MarkRunning(int total)
    {
        lock (_gate)
        {
            Total = total;
            if (Status == BulkWorkflowRunStatus.Collecting) Status = BulkWorkflowRunStatus.Running;
        }
    }

    public void RecordBatch(int sent, IReadOnlyList<RunErrorDto> errors, TimeSpan duration)
    {
        lock (_gate)
        {
            Processed += sent;
            Failed += errors.Count;
            Succeeded += sent - errors.Count;
            _completedBatches++;
            _batchTime += duration;
            AddErrors(errors);
        }
    }

    /// <summary>Records sent in a batch whose outcome is not known. They count as processed and failed.</summary>
    public void RecordUnknown(IReadOnlyList<RunErrorDto> errors)
    {
        lock (_gate)
        {
            Processed += errors.Count;
            Failed += errors.Count;
            AddErrors(errors);
        }
    }

    public void Finish()
    {
        lock (_gate)
        {
            Status = Status switch
            {
                BulkWorkflowRunStatus.Cancelling => BulkWorkflowRunStatus.Cancelled,
                BulkWorkflowRunStatus.Collecting or BulkWorkflowRunStatus.Running => BulkWorkflowRunStatus.Completed,
                _ => Status,
            };
        }
    }

    public void Fail(string message)
    {
        lock (_gate)
        {
            if (IsEnd(Status)) return;
            Status = BulkWorkflowRunStatus.Failed;
            _message = message;
        }
    }

    public RunDto ToDto()
    {
        lock (_gate)
        {
            var estimate = Status == BulkWorkflowRunStatus.Running
                ? BulkWorkflowEstimate.SecondsRemaining(
                    _completedBatches,
                    _batchTime,
                    Total - Processed,
                    Run.BatchSize,
                    Run.DelaySeconds)
                : null;
            return new RunDto
            {
                Status = Status,
                Total = Total,
                Processed = Processed,
                Succeeded = Succeeded,
                Failed = Failed,
                Errors = _errors.ToList(),
                ErrorsCapped = _errorsCapped,
                StartedAt = StartedAt.ToString("O", CultureInfo.InvariantCulture),
                EstimatedSecondsRemaining = estimate,
                Message = _message,
            };
        }
    }

    private void AddErrors(IReadOnlyList<RunErrorDto> errors)
    {
        foreach (var error in errors)
        {
            if (_errors.Count >= BulkWorkflowLimits.MaxErrors)
            {
                _errorsCapped = true;
                return;
            }

            _errors.Add(error);
        }
    }

    private static bool IsEnd(string status) =>
        status is BulkWorkflowRunStatus.Cancelled or BulkWorkflowRunStatus.Completed or BulkWorkflowRunStatus.Failed;
}

public interface IBulkWorkflowJobStore
{
    Guid Save(PreparedRun run, DataverseConnectionContext connection);
    BulkWorkflowJob? Get(Guid id);
    BulkWorkflowJob? DequeueNext();
}

public sealed class InMemoryBulkWorkflowJobStore(TimeProvider clock) : IBulkWorkflowJobStore
{
    private readonly ConcurrentDictionary<Guid, BulkWorkflowJob> _jobs = new();
    private readonly ConcurrentQueue<Guid> _queue = new();

    public InMemoryBulkWorkflowJobStore() : this(TimeProvider.System)
    {
    }

    public Guid Save(PreparedRun run, DataverseConnectionContext connection)
    {
        var job = new BulkWorkflowJob(run, connection, clock.GetUtcNow());
        _jobs[job.Id] = job;
        _queue.Enqueue(job.Id);
        return job.Id;
    }

    public BulkWorkflowJob? Get(Guid id) => _jobs.GetValueOrDefault(id);

    public BulkWorkflowJob? DequeueNext()
    {
        while (_queue.TryDequeue(out var id))
        {
            if (_jobs.TryGetValue(id, out var job)) return job;
        }

        return null;
    }
}
