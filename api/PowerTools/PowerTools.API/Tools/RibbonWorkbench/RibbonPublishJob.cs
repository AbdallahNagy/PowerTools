using System.Collections.Concurrent;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.RibbonWorkbench;

/// <summary>A publish request that passed validation.</summary>
public sealed record PreparedPublish(
    string SolutionUniqueName,
    IReadOnlyDictionary<string, RibbonNodeDto> Diffs,
    IReadOnlyDictionary<string, string> BaseHashes);

public sealed class RibbonPublishJob
{
    private readonly object _gate = new();
    private readonly PublishJobDto _state = new();

    public RibbonPublishJob(PreparedPublish prepared, DataverseConnectionContext connection)
    {
        Prepared = prepared;
        Connection = connection;
        _state.Targets = RibbonPublisher.Targets(prepared.Diffs.Keys);
    }

    public Guid Id { get; } = Guid.NewGuid();
    public PreparedPublish Prepared { get; }
    public DataverseConnectionContext Connection { get; }

    public string Status
    {
        get
        {
            lock (_gate) return _state.Status;
        }
    }

    public void Start(string phase)
    {
        lock (_gate)
        {
            _state.Status = PublishJobStatuses.Running;
            _state.Phase = phase;
        }
    }

    public void Progress(double progress)
    {
        lock (_gate) _state.Progress = Math.Clamp(progress, 0, 100);
    }

    public void Warn(IEnumerable<string> warnings)
    {
        lock (_gate)
        {
            foreach (var warning in warnings)
            {
                if (!_state.Warnings.Contains(warning)) _state.Warnings.Add(warning);
            }
        }
    }

    public void Finish(string status, string? message = null, IEnumerable<string>? errors = null)
    {
        lock (_gate)
        {
            _state.Status = status;
            _state.Phase = PublishJobPhases.Done;
            _state.Message = message;
            if (status == PublishJobStatuses.Succeeded) _state.Progress = 100;
            foreach (var error in errors ?? [])
            {
                if (!_state.Errors.Contains(error)) _state.Errors.Add(error);
            }
        }
    }

    public PublishJobDto ToDto()
    {
        lock (_gate)
        {
            return new PublishJobDto
            {
                Status = _state.Status,
                Phase = _state.Phase,
                Progress = _state.Progress,
                Message = _state.Message,
                Errors = _state.Errors.ToList(),
                Warnings = _state.Warnings.ToList(),
                Targets = new PublishTargetsDto
                {
                    Entities = _state.Targets.Entities.ToList(),
                    ApplicationRibbon = _state.Targets.ApplicationRibbon,
                },
            };
        }
    }
}

public interface IRibbonPublishJobStore
{
    Guid Save(PreparedPublish prepared, DataverseConnectionContext connection);
    RibbonPublishJob? Get(Guid id);
    RibbonPublishJob? DequeueNext();
}

public sealed class InMemoryRibbonPublishJobStore : IRibbonPublishJobStore
{
    private readonly ConcurrentDictionary<Guid, RibbonPublishJob> _jobs = new();
    private readonly ConcurrentQueue<Guid> _queue = new();

    public Guid Save(PreparedPublish prepared, DataverseConnectionContext connection)
    {
        var job = new RibbonPublishJob(prepared, connection);
        _jobs[job.Id] = job;
        _queue.Enqueue(job.Id);
        return job.Id;
    }

    public RibbonPublishJob? Get(Guid id) => _jobs.GetValueOrDefault(id);

    public RibbonPublishJob? DequeueNext()
    {
        while (_queue.TryDequeue(out var id))
        {
            if (_jobs.TryGetValue(id, out var job) && job.Status == PublishJobStatuses.Queued) return job;
        }

        return null;
    }
}

/// <summary>Re-export, compare, splice, import, wait, and publish for one job.</summary>
public sealed class RibbonPublisher(IRibbonWorkbenchClient client, IRibbonDelay delay, bool online = true)
{
    public static readonly TimeSpan ImportPollInterval = TimeSpan.FromSeconds(3);
    public static readonly TimeSpan ImportTimeout = TimeSpan.FromMinutes(15);

    public const string ConflictMessage =
        "The command bar of {0} changed in Dataverse after you loaded it. Nothing was imported. Reload the solution, " +
        "then make your changes again.";

    public static PublishTargetsDto Targets(IEnumerable<string> keys)
    {
        var targets = new PublishTargetsDto();
        foreach (var key in keys)
        {
            if (RibbonKeys.IsApplication(key)) targets.ApplicationRibbon = true;
            else targets.Entities.Add(key.ToLowerInvariant());
        }

        targets.Entities = targets.Entities.Distinct(StringComparer.Ordinal).OrderBy(name => name, StringComparer.Ordinal).ToList();
        return targets;
    }

    public async Task RunAsync(RibbonPublishJob job, CancellationToken cancellationToken)
    {
        var prepared = job.Prepared;
        var service = new RibbonWorkbenchService(client, delay, online);

        job.Start(PublishJobPhases.Exporting);
        var exported = await service.ExportAsync(prepared.SolutionUniqueName, cancellationToken);
        var package = RibbonSolutionPackage.Read(exported);

        foreach (var key in prepared.Diffs.Keys)
        {
            var current = ExportedDiff(package, key);
            prepared.BaseHashes.TryGetValue(key, out var loadedHash);
            if (!string.Equals(loadedHash, RibbonXml.Hash(RibbonXml.ToNode(current)), StringComparison.OrdinalIgnoreCase))
            {
                job.Finish(PublishJobStatuses.Conflict, string.Format(ConflictMessage, RibbonKeys.IsApplication(key) ? "the application ribbon" : key));
                return;
            }
        }

        var spliced = RibbonSolutionPackage.Splice(exported, RibbonWorkbenchService.ToElements(prepared.Diffs));

        job.Start(PublishJobPhases.Importing);
        var importJobId = Guid.NewGuid();
        var operationId = await client.StartImportAsync(spliced, importJobId, cancellationToken);

        var waited = TimeSpan.Zero;
        ImportJobState? import = null;
        while (true)
        {
            await delay.WaitAsync(ImportPollInterval, cancellationToken);
            waited += ImportPollInterval;

            var operation = await client.RetrieveAsyncOperationAsync(operationId, cancellationToken);
            // The importjob row may not exist for a short time after submission; that means queued.
            import = await client.RetrieveImportJobAsync(importJobId, cancellationToken) ?? import;
            if (import is not null) job.Progress(import.Progress);

            if (operation is { StatusCode: AsyncOperationState.Succeeded }) break;
            if (operation is { IsFinished: true })
            {
                var results = ImportJobData.Parse(import?.Data);
                var errors = new List<string>();
                var reason = operation.FriendlyMessage ?? operation.Message;
                if (!string.IsNullOrWhiteSpace(reason)) errors.Add(reason.Trim());
                errors.AddRange(results.Failures);
                if (errors.Count == 0)
                    errors.Add(operation.StatusCode == AsyncOperationState.Canceled ? "The import was canceled." : "Dataverse did not give a reason.");
                job.Warn(results.Warnings);
                job.Finish(PublishJobStatuses.Failed, "The solution could not be imported.", errors);
                return;
            }

            if (waited >= ImportTimeout)
            {
                job.Finish(
                    PublishJobStatuses.TimedOut,
                    "The import is still running in Dataverse after 15 minutes. Check the solution later before you publish again.");
                return;
            }
        }

        job.Warn(ImportJobData.Parse(import?.Data).Warnings);
        job.Progress(100);

        job.Start(PublishJobPhases.Publishing);
        try
        {
            await client.PublishAsync(RibbonRequests.PublishXml(Targets(prepared.Diffs.Keys)), cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            job.Finish(
                PublishJobStatuses.PublishFailed,
                "The changes were imported but not published, so users still see the old command bar.",
                [RibbonWorkbenchFaults.Describe(ex)]);
            return;
        }

        job.Finish(PublishJobStatuses.Succeeded);
    }

    private static System.Xml.Linq.XElement ExportedDiff(RibbonSolutionPackage package, string key)
    {
        if (RibbonKeys.IsApplication(key))
        {
            return package.ApplicationDiff
                ?? throw new RibbonPackageException(
                    "The solution has no application ribbon. Add Application Ribbons to the solution, then reload.");
        }

        var entity = package.Entities.FirstOrDefault(item => string.Equals(item.LogicalName, key, StringComparison.OrdinalIgnoreCase))
            ?? throw new RibbonPackageException(
                $"Cannot find table {key} in the solution. It may have been removed after the solution was loaded.");
        return entity.Diff
            ?? throw new RibbonPackageException(
                $"Table {key} has no command bar definition in the solution. Add the table with its metadata, then reload.");
    }
}

/// <summary>
/// Runs publish jobs one at a time. Dataverse runs one import or publish per organization, so jobs from
/// several tabs must not run side by side.
/// </summary>
public sealed class RibbonPublishJobRunner(
    IRibbonPublishJobStore store,
    DataverseClientFactory factory,
    IRibbonDelay delay,
    ILogger<RibbonPublishJobRunner> logger) : BackgroundService
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
                    var online = job.Connection is OnlineConnectionContext;
                    await new RibbonPublisher(new DataverseRibbonWorkbenchClient(service), delay, online).RunAsync(job, stoppingToken);
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
                job.Finish(PublishJobStatuses.Failed, "The solution could not be imported.", [RibbonWorkbenchFaults.Describe(ex)]);
                logger.LogError(ex, "Ribbon publish job {JobId} stopped", job.Id);
            }
        }
    }
}
