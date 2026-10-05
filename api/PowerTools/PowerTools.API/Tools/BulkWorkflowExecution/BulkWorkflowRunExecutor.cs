using Microsoft.Crm.Sdk.Messages;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.BulkWorkflowExecution;

/// <summary>
/// Runs one job: snapshots every record id first, then sends sequential ExecuteMultiple batches of
/// ExecuteWorkflow requests. A stop request takes effect after the batch in flight.
/// </summary>
public sealed class BulkWorkflowRunExecutor(IBulkWorkflowClient client, IBulkWorkflowDelay delay, TimeProvider clock)
{
    public const string UnknownOutcomeMessage =
        "Outcome unknown: the batch request did not finish. Check system jobs before running this record again.";

    public async Task RunAsync(BulkWorkflowJob job, CancellationToken cancellationToken)
    {
        var run = job.Run;
        var collected = await new BulkWorkflowExecutionService(client)
            .CollectIdsAsync(run.Query, run.PageSize, () => job.StopRequested, cancellationToken);
        if (collected.Problem is not null)
        {
            job.Fail(collected.Problem.Message);
            return;
        }

        var ids = collected.Value!;
        job.MarkRunning(ids.Count);

        var batchSize = run.BatchSize;
        var index = 0;
        while (index < ids.Count && !job.StopRequested)
        {
            var batch = ids.Skip(index).Take(batchSize).ToList();
            var started = clock.GetTimestamp();
            ExecuteMultipleResponse response;
            try
            {
                response = (ExecuteMultipleResponse)await client.ExecuteAsync(Batch(run.WorkflowId, batch), cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                var fault = BulkWorkflowFaults.Unwrap(ex);
                if (BulkWorkflowFaults.MaxBatchSize(fault?.Detail) is int limit && limit >= 1 && limit < batch.Count)
                {
                    // Rejected before any request in the batch ran, so resending is safe.
                    batchSize = limit;
                    continue;
                }

                var message = DataverseErrorFormatter.Format(ex);
                if (fault is not null && BulkWorkflowFaults.IsServiceProtection(fault.Detail.ErrorCode))
                {
                    job.Fail($"Dataverse service protection limits stopped the run: {message}");
                    return;
                }

                job.RecordUnknown(batch
                    .Select(id => new RunErrorDto { RecordId = id.ToString(), Message = UnknownOutcomeMessage })
                    .ToList());
                job.Fail($"{message} {batch.Count:N0} records in the last batch have an unknown outcome.");
                return;
            }

            var errors = new List<RunErrorDto>();
            var notOnDemand = 0;
            foreach (var item in response.Responses)
            {
                if (item.Fault is null) continue;
                if (BulkWorkflowFaults.IsNotOnDemand(item.Fault.ErrorCode)) notOnDemand++;
                var recordId = item.RequestIndex >= 0 && item.RequestIndex < batch.Count
                    ? batch[item.RequestIndex].ToString()
                    : "";
                errors.Add(new RunErrorDto { RecordId = recordId, Message = BulkWorkflowFaults.ItemMessage(item.Fault) });
            }

            job.RecordBatch(batch.Count, errors, clock.GetElapsedTime(started));
            index += batch.Count;

            if (notOnDemand == batch.Count)
            {
                job.Fail("The workflow is no longer activated or on-demand.");
                return;
            }

            if (index < ids.Count && run.DelaySeconds > 0 && !job.StopRequested)
            {
                using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, job.StopToken);
                try
                {
                    await delay.WaitAsync(TimeSpan.FromSeconds(run.DelaySeconds), linked.Token);
                }
                catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
                {
                    // Stop was requested during the delay.
                }
            }
        }

        job.Finish();
    }

    public static ExecuteMultipleRequest Batch(Guid workflowId, IReadOnlyList<Guid> recordIds)
    {
        var request = new ExecuteMultipleRequest
        {
            Settings = new ExecuteMultipleSettings
            {
                ContinueOnError = true,
                ReturnResponses = false,
            },
            Requests = new OrganizationRequestCollection(),
        };
        foreach (var id in recordIds)
            request.Requests.Add(new ExecuteWorkflowRequest { WorkflowId = workflowId, EntityId = id });
        return request;
    }
}
