using System.Collections.Concurrent;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.EarlyBoundGenerator;

public sealed class EarlyBoundGeneratorJob(GenerationSettingsDto settings, DataverseConnectionContext connection)
    : IEngineObserver
{
    /// <summary>The engine logs a line per file on large runs; keep the tail.</summary>
    public const int MaxLogLines = 500;

    private readonly object _gate = new();
    private readonly EarlyBoundGeneratorJobDto _state = new() { OutputDirectory = settings.OutputDirectory };

    public Guid Id { get; } = Guid.NewGuid();
    public GenerationSettingsDto Settings { get; } = settings;
    public DataverseConnectionContext Connection { get; } = connection;

    public string State
    {
        get
        {
            lock (_gate) return _state.State;
        }
    }

    public bool IsActive => State is JobStates.Queued or JobStates.Running;

    public void MarkRunning()
    {
        lock (_gate)
        {
            if (_state.State == JobStates.Queued) _state.State = JobStates.Running;
        }
    }

    public void Stage(string stage)
    {
        lock (_gate) _state.Stage = stage;
    }

    public void Log(string line)
    {
        lock (_gate)
        {
            _state.Log.Add(line);
            if (_state.Log.Count > MaxLogLines) _state.Log.RemoveAt(0);
        }
    }

    public void Succeed(IReadOnlyList<GeneratedFileDto> files, TimeSpan duration)
    {
        lock (_gate)
        {
            _state.State = JobStates.Succeeded;
            _state.Stage = null;
            _state.Files = files.ToList();
            _state.DurationMs = (long)duration.TotalMilliseconds;
        }
    }

    public void Fail(string message, string kind, IReadOnlyList<GeneratedFileDto> files, TimeSpan? duration)
    {
        lock (_gate)
        {
            _state.State = JobStates.Failed;
            _state.Stage = null;
            _state.Error = message;
            _state.ErrorKind = kind;
            _state.Files = files.ToList();
            _state.DurationMs = duration is { } value ? (long)value.TotalMilliseconds : null;
        }
    }

    public EarlyBoundGeneratorJobDto ToDto()
    {
        lock (_gate)
        {
            return new EarlyBoundGeneratorJobDto
            {
                State = _state.State,
                Stage = _state.Stage,
                Log = _state.Log.ToList(),
                Files = _state.Files.ToList(),
                Error = _state.Error,
                ErrorKind = _state.ErrorKind,
                OutputDirectory = _state.OutputDirectory,
                DurationMs = _state.DurationMs,
            };
        }
    }
}

public interface IEarlyBoundGeneratorJobStore
{
    /// <summary>Queues a job, or returns null when another generation is queued or running.</summary>
    EarlyBoundGeneratorJob? TryEnqueue(GenerationSettingsDto settings, DataverseConnectionContext connection);
    EarlyBoundGeneratorJob? Get(Guid id);
    EarlyBoundGeneratorJob? DequeueNext();
}

/// <summary>
/// One generation at a time across the whole sidecar: the engine keeps static state and writes to
/// shared folders, so a second tab gets a 409 instead of a queued run.
/// </summary>
public sealed class InMemoryEarlyBoundGeneratorJobStore : IEarlyBoundGeneratorJobStore
{
    private readonly object _gate = new();
    private readonly ConcurrentDictionary<Guid, EarlyBoundGeneratorJob> _jobs = new();
    private readonly ConcurrentQueue<Guid> _queue = new();

    public EarlyBoundGeneratorJob? TryEnqueue(GenerationSettingsDto settings, DataverseConnectionContext connection)
    {
        lock (_gate)
        {
            if (_jobs.Values.Any(job => job.IsActive)) return null;
            var job = new EarlyBoundGeneratorJob(settings, connection);
            _jobs[job.Id] = job;
            _queue.Enqueue(job.Id);
            return job;
        }
    }

    public EarlyBoundGeneratorJob? Get(Guid id) => _jobs.GetValueOrDefault(id);

    public EarlyBoundGeneratorJob? DequeueNext()
    {
        while (_queue.TryDequeue(out var id))
        {
            if (_jobs.TryGetValue(id, out var job) && job.State == JobStates.Queued) return job;
        }

        return null;
    }
}
