using System.Collections.Concurrent;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.Translator;

public sealed class TranslatorJob
{
    private readonly object _gate = new();
    private readonly TranslatorJobDto _state = new();

    public TranslatorJob(PreparedApply prepared, DataverseConnectionContext connection)
    {
        Prepared = prepared;
        Connection = connection;
        _state.Total = prepared.Rows.Sum(row => row.Labels.Count) + prepared.Rejected.Sum(result => result.Lcids.Length);
        if (prepared.Solution is { } solution)
        {
            _state.Solution = new SolutionResultDto
            {
                Status = SolutionStatuses.Pending,
                UniqueName = solution.UniqueName,
                FriendlyName = solution.FriendlyName,
            };
        }
    }

    public Guid Id { get; } = Guid.NewGuid();
    public PreparedApply Prepared { get; }
    public DataverseConnectionContext Connection { get; }

    public string Status
    {
        get
        {
            lock (_gate) return _state.Status;
        }
    }

    public void MarkRunning()
    {
        lock (_gate)
        {
            if (_state.Status == "queued") _state.Status = "running";
        }
    }

    public void Record(IEnumerable<ApplyResultDto> results)
    {
        lock (_gate)
        {
            foreach (var result in results)
            {
                _state.Results.Add(result);
                var labels = result.Lcids.Length;
                _state.Processed += labels;
                switch (result.Outcome)
                {
                    case ApplyOutcomes.Succeeded:
                        _state.Succeeded += labels;
                        break;
                    case ApplyOutcomes.Skipped:
                        _state.Skipped += labels;
                        _state.Log.Add(new JobLogDto("warn", result.Message ?? "Skipped."));
                        break;
                    default:
                        _state.Failed += labels;
                        _state.Log.Add(new JobLogDto("error", result.Message ?? "Failed."));
                        break;
                }
            }
        }
    }

    public void Log(string level, string message)
    {
        lock (_gate) _state.Log.Add(new JobLogDto(level, message));
    }

    public void StartPublish(PublishTargetsDto targets)
    {
        lock (_gate)
        {
            _state.Phase = "publishing";
            _state.Publish = new PublishResultDto { Status = PublishStatuses.Running, Targets = targets };
        }
    }

    public void FinishPublish(string status, string? message)
    {
        lock (_gate)
        {
            _state.Publish.Status = status;
            _state.Publish.Message = message;
            if (message is not null) _state.Log.Add(new JobLogDto("error", $"Publish failed: {message}"));
        }
    }

    public void StartSolution()
    {
        lock (_gate)
        {
            _state.Phase = "solution";
            _state.Solution.Status = SolutionStatuses.Running;
        }
    }

    public void SolutionCreated()
    {
        lock (_gate) _state.Solution.Created = true;
    }

    public void FinishSolution(string status, int added, IReadOnlyList<SolutionFailureDto> failures, string? message)
    {
        lock (_gate)
        {
            _state.Solution.Status = status;
            _state.Solution.Added = added;
            _state.Solution.Failed = failures.Count;
            _state.Solution.Failures = failures.ToList();
            _state.Solution.Message = message;
            if (message is not null && status is SolutionStatuses.Failed or SolutionStatuses.Partial)
                _state.Log.Add(new JobLogDto("error", $"Adding components to the solution failed: {message}"));
        }
    }

    public void Complete()
    {
        lock (_gate)
        {
            _state.Phase = "done";
            _state.Status = "completed";
        }
    }

    /// <summary>The job stopped before it finished. Labels not yet processed are reported as failed.</summary>
    public void MarkFaulted(string message)
    {
        lock (_gate)
        {
            if (_state.Status == "completed") return;
            var remaining = _state.Total - _state.Processed;
            _state.Failed += Math.Max(0, remaining);
            _state.Processed = _state.Total;
            _state.Status = "failed";
            _state.Phase = "done";
            _state.Log.Add(new JobLogDto("error", message));
        }
    }

    public TranslatorJobDto ToDto()
    {
        lock (_gate)
        {
            return new TranslatorJobDto
            {
                Status = _state.Status,
                Phase = _state.Phase,
                Processed = _state.Processed,
                Total = _state.Total,
                Succeeded = _state.Succeeded,
                Failed = _state.Failed,
                Skipped = _state.Skipped,
                Results = _state.Results.ToList(),
                Publish = new PublishResultDto
                {
                    Status = _state.Publish.Status,
                    Message = _state.Publish.Message,
                    Targets = new PublishTargetsDto
                    {
                        Tables = _state.Publish.Targets.Tables.ToList(),
                        OptionSets = _state.Publish.Targets.OptionSets.ToList(),
                    },
                },
                Solution = new SolutionResultDto
                {
                    Status = _state.Solution.Status,
                    UniqueName = _state.Solution.UniqueName,
                    FriendlyName = _state.Solution.FriendlyName,
                    Created = _state.Solution.Created,
                    Added = _state.Solution.Added,
                    Failed = _state.Solution.Failed,
                    Message = _state.Solution.Message,
                    Failures = _state.Solution.Failures.ToList(),
                },
                Log = _state.Log.ToList(),
            };
        }
    }
}

public interface ITranslatorJobStore
{
    Guid Save(PreparedApply prepared, DataverseConnectionContext connection);
    TranslatorJob? Get(Guid id);
    TranslatorJob? DequeueNext();
}

public sealed class InMemoryTranslatorJobStore : ITranslatorJobStore
{
    private readonly ConcurrentDictionary<Guid, TranslatorJob> _jobs = new();
    private readonly ConcurrentQueue<Guid> _queue = new();

    public Guid Save(PreparedApply prepared, DataverseConnectionContext connection)
    {
        var job = new TranslatorJob(prepared, connection);
        _jobs[job.Id] = job;
        _queue.Enqueue(job.Id);
        return job.Id;
    }

    public TranslatorJob? Get(Guid id) => _jobs.GetValueOrDefault(id);

    public TranslatorJob? DequeueNext()
    {
        while (_queue.TryDequeue(out var id))
        {
            if (_jobs.TryGetValue(id, out var job) && job.Status == "queued")
                return job;
        }

        return null;
    }
}

/// <summary>
/// Runs apply jobs one at a time. Dataverse allows one customization operation per organization,
/// so jobs from several tabs on the same environment must not run side by side.
/// </summary>
public sealed class TranslatorJobRunner(
    ITranslatorJobStore store,
    DataverseClientFactory factory,
    ITranslatorDelay delay,
    ILogger<TranslatorJobRunner> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var job = store.DequeueNext();
            if (job is null)
            {
                await Task.Delay(200, stoppingToken);
                continue;
            }

            try
            {
                var service = factory.Create(job.Connection);
                try
                {
                    await new TranslatorApply(new DataverseTranslatorClient(service), delay).RunAsync(job, stoppingToken);
                }
                finally
                {
                    (service as IDisposable)?.Dispose();
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                job.MarkFaulted(TranslatorFaults.From(ex).Message);
                logger.LogError(ex, "Translator apply job {JobId} stopped", job.Id);
            }
        }
    }
}
