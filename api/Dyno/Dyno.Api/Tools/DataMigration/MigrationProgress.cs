namespace Dyno.Api.Tools.DataMigration;

/// <summary>
/// The state of one migration job. The run records into it while the status route reads it, so every
/// member takes the same lock and <see cref="Snapshot"/> returns a copy.
/// </summary>
public sealed class MigrationProgress
{
    private readonly object _gate = new();
    private readonly List<MigrationJobError> _errors = [];
    private MigrationJobStatus _status = MigrationJobStatus.Queued;
    private int _total;
    private int _processed;
    private int _succeeded;
    private int _created;
    private int _updated;
    private int _skipped;
    private int _deleted;
    private int _failed;

    public MigrationJobStatus Status
    {
        get { lock (_gate) return _status; }
    }

    public void MarkRunning()
    {
        lock (_gate) _status = MigrationJobStatus.Running;
    }

    public void Complete()
    {
        lock (_gate) _status = MigrationJobStatus.Completed;
    }

    /// <summary>The run stopped. The error is recorded against no record.</summary>
    public void Fail(string message)
    {
        lock (_gate)
        {
            _status = MigrationJobStatus.Failed;
            _errors.Add(new MigrationJobError("N/A", message));
        }
    }

    public void SetTotal(int total)
    {
        lock (_gate) _total = total;
    }

    public void AddToTotal(int count)
    {
        lock (_gate) _total += count;
    }

    /// <summary>A source record the options do not cover.</summary>
    public void RecordSkipped()
    {
        lock (_gate)
        {
            _processed++;
            _skipped++;
        }
    }

    /// <summary>A record Dataverse created or updated.</summary>
    public void RecordSent(RecordAction action)
    {
        lock (_gate)
        {
            _processed++;
            _succeeded++;
            if (action == RecordAction.Create) _created++;
            else _updated++;
        }
    }

    public void RecordDeleted()
    {
        lock (_gate)
        {
            _processed++;
            _deleted++;
        }
    }

    /// <summary>A record Dataverse rejected. It counts as processed and failed.</summary>
    public void RecordRejected(string recordId, string message)
    {
        lock (_gate)
        {
            _processed++;
            _failed++;
            _errors.Add(new MigrationJobError(recordId, message));
        }
    }

    /// <summary>The delete step did not run. It counts as one failure against no record.</summary>
    public void RecordDeleteBlocked(string reason)
    {
        lock (_gate)
        {
            _failed++;
            _errors.Add(new MigrationJobError("N/A", reason));
        }
    }

    public MigrationStatusSnapshot Snapshot()
    {
        lock (_gate)
        {
            return new MigrationStatusSnapshot(
                _status, _total, _processed, _succeeded, _created, _updated, _skipped, _deleted, _failed,
                _errors.ToList());
        }
    }
}

/// <summary>A copy of a job's state at one moment.</summary>
public sealed record MigrationStatusSnapshot(
    MigrationJobStatus Status,
    int Total,
    int Processed,
    int Succeeded,
    int Created,
    int Updated,
    int Skipped,
    int Deleted,
    int Failed,
    IReadOnlyList<MigrationJobError> Errors);
