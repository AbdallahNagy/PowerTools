using Data8.PowerPlatform.Dataverse.Client;
using Microsoft.Xrm.Sdk;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.EarlyBoundGenerator;

/// <summary>Runs queued generations one at a time on a background thread.</summary>
public sealed class EarlyBoundGeneratorJobRunner(
    IEarlyBoundGeneratorJobStore store,
    DataverseClientFactory factory,
    IEarlyBoundEngine engine,
    ILogger<EarlyBoundGeneratorJobRunner> logger) : BackgroundService
{
    /// <summary>
    /// The on-premises client times out after 2 minutes, which an unfiltered metadata read on a large
    /// organization can exceed. Each job gets its own client, so raising it here affects no other request.
    /// </summary>
    public static readonly TimeSpan OnPremisesTimeout = TimeSpan.FromMinutes(10);

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
                var client = factory.Create(job.Connection);
                try
                {
                    if (client is OnPremiseClient onPremises) onPremises.Timeout = OnPremisesTimeout;
                    await Task.Run(() => new EarlyBoundGeneratorRun(engine).Execute(job, (IOrganizationService)client), stoppingToken);
                }
                finally
                {
                    (client as IDisposable)?.Dispose();
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                job.Fail(DataverseErrorFormatter.Format(ex), FailureKinds.Connection, [], null);
                logger.LogError(ex, "Early bound generation job {JobId} stopped", job.Id);
            }
        }
    }
}
