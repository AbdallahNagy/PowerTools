using PowerTools.API.Services;

namespace PowerTools.API.Tools.DataMigration;

/// <summary>Runs queued migration jobs one at a time.</summary>
public class MigrationJobRunner(
    IMigrationJobStore store,
    DataverseClientFactory factory,
    ILogger<MigrationJobRunner> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var job = store.DequeueNext();
            if (job is null)
            {
                await Task.Delay(500, ct);
                continue;
            }

            // Running from here, so a job does not read as queued while its connections open.
            job.Progress.MarkRunning();

            // A connection that fails to open fails this job, and the runner goes on to the next one.
            DataverseDataMigrationClient? source = null;
            DataverseDataMigrationClient target;
            try
            {
                source = new DataverseDataMigrationClient(factory.Create(job.SourceConnection));
                target = new DataverseDataMigrationClient(factory.Create(job.TargetConnection));
            }
            catch (Exception ex)
            {
                CloseQuietly(source);
                job.Progress.Fail(DataverseErrorFormatter.Format(ex));
                logger.LogError(ex, "Migration job {JobId} failed", job.Id);
                continue;
            }

            // The run closes both connections before it reports the outcome, and it does not throw.
            await new DataMigrationRun(source, target, logger).RunAsync(job.Request, job.Progress, ct);
        }
    }

    private void CloseQuietly(IDisposable? client)
    {
        try
        {
            client?.Dispose();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not close a Dataverse connection");
        }
    }
}
