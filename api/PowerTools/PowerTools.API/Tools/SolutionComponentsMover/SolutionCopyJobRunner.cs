using PowerTools.API.Services;

namespace PowerTools.API.Tools.SolutionComponentsMover;

public sealed class SolutionCopyJobRunner(
    ISolutionCopyJobStore store,
    DataverseClientFactory factory,
    ISolutionCopyDelay delay,
    ILogger<SolutionCopyJobRunner> logger) : BackgroundService
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
                    var client = new DataverseSolutionComponentsMoverClient(service);
                    await new SolutionComponentsMoverService(client, delay).AddAsync(job, stoppingToken);
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
                job.MarkFaulted(SolutionComponentsMoverFaults.From(ex).Message);
                logger.LogError(ex, "Solution component copy {JobId} stopped", job.Id);
            }
        }
    }
}
