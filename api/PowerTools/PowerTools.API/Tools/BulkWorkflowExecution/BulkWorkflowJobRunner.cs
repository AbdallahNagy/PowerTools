using PowerTools.API.Services;

namespace PowerTools.API.Tools.BulkWorkflowExecution;

/// <summary>
/// Picks up saved runs and runs each one on its own task, so two tabs can run two workflows at once.
/// Batches inside one run stay sequential.
/// </summary>
public sealed class BulkWorkflowJobRunner(
    IBulkWorkflowJobStore store,
    DataverseClientFactory factory,
    IBulkWorkflowDelay delay,
    ILogger<BulkWorkflowJobRunner> logger) : BackgroundService
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

            _ = Task.Run(() => RunJobAsync(job, stoppingToken), stoppingToken);
        }
    }

    private async Task RunJobAsync(BulkWorkflowJob job, CancellationToken stoppingToken)
    {
        try
        {
            var service = factory.Create(job.Connection);
            try
            {
                var executor = new BulkWorkflowRunExecutor(new DataverseBulkWorkflowClient(service), delay, TimeProvider.System);
                await executor.RunAsync(job, stoppingToken);
            }
            finally
            {
                (service as IDisposable)?.Dispose();
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            job.Fail("The run stopped because Power Tools is closing.");
        }
        catch (Exception ex)
        {
            job.Fail(DataverseErrorFormatter.Format(ex));
            logger.LogError(ex, "Bulk workflow run {JobId} failed", job.Id);
        }
    }
}
