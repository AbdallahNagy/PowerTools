using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.DataMigration;

/// <summary>
/// Carries out one table's migration from a source to a target Dataverse connection: creates and updates
/// records, then deletes target records missing from the source when asked. Progress and errors go to the job.
/// </summary>
public sealed class DataMigrationRun(IDataMigrationClient source, IDataMigrationClient target, ILogger? logger = null)
{
    private const int BatchSize = 100;

    /// <summary>
    /// Runs the job to its end. It does not throw: a failure that stops the run marks the job failed with the
    /// Dataverse error, and a record Dataverse rejects is recorded and the run goes on.
    /// </summary>
    public async Task RunAsync(MigrationJob job, CancellationToken ct)
    {
        job.Status = MigrationJobStatus.Running;
        try
        {
            await RunStepsAsync(job, ct);
            job.Status = MigrationJobStatus.Completed;
        }
        catch (Exception ex)
        {
            Fail(job, ex);
            logger?.LogError(ex, "Migration job {JobId} failed", job.Id);
        }
    }

    /// <summary>Marks the job failed with the error that stopped it.</summary>
    public static void Fail(MigrationJob job, Exception ex)
    {
        job.Status = MigrationJobStatus.Failed;
        job.Errors.Add(new MigrationJobError("N/A", DataverseErrorFormatter.Format(ex)));
    }

    private async Task RunStepsAsync(MigrationJob job, CancellationToken ct)
    {
        var sends = job.Options.Create || job.Options.Update;

        // Progress covers the records sent; deletions are added once they are known.
        if (sends)
            job.Total = await CountRecordsAsync(job, ct);

        var targetTable = await DataMigrationTable.OpenAsync(target, job.EntityLogicalName, ct);

        if (sends)
            await TransferRecordsAsync(job, targetTable, ct);

        // Last, so a run that fails while reading or writing records deletes nothing.
        if (job.Options.Delete)
        {
            var sourceTable = await DataMigrationTable.OpenAsync(source, job.EntityLogicalName, ct);
            await DeleteMissingRecordsAsync(job, sourceTable, targetTable, ct);
        }
    }

    // The total only drives progress, so a failed count must not stop the migration.
    private async Task<int> CountRecordsAsync(MigrationJob job, CancellationToken ct)
    {
        try
        {
            var sourceTable = await DataMigrationTable.OpenAsync(source, job.EntityLogicalName, ct);
            return await sourceTable.CountAsync(job.FetchXmlFilter, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger?.LogWarning(ex, "Could not count records for migration job {JobId}", job.Id);
            return 0;
        }
    }

    private async Task TransferRecordsAsync(MigrationJob job, DataMigrationTable targetTable, CancellationToken ct)
    {
        await foreach (var page in DataMigrationTable.PagesAsync(
            source, job.EntityLogicalName, MigrationPlan.SourceColumns(job.Attributes), job.FetchXmlFilter, BatchSize, ct))
        {
            if (page.Count == 0) break;

            var existing = await targetTable.ExistingIdsAsync(page.Select(e => e.Id).ToList(), ct);
            await SendBatchAsync(job, page, existing, ct);
        }
    }

    private async Task SendBatchAsync(
        MigrationJob job,
        DataCollection<Entity> entities,
        HashSet<Guid> existing,
        CancellationToken ct)
    {
        var request = NewBatch();
        var sent = new List<(string RecordId, RecordAction Action)>();

        foreach (var sourceRecord in entities)
        {
            var action = MigrationPlan.Decide(job.Options, existing.Contains(sourceRecord.Id));
            if (action == RecordAction.Skip)
            {
                job.Processed++;
                job.Skipped++;
                continue;
            }

            var record = new Entity(job.EntityLogicalName) { Id = sourceRecord.Id };
            foreach (var attr in job.Attributes)
            {
                if (sourceRecord.Contains(attr))
                    record[attr] = sourceRecord[attr];
            }

            OrganizationRequest req;
            if (action == RecordAction.Update)
            {
                req = new UpdateRequest { Target = record };
            }
            else
            {
                // An inactive record is created active and then moved to its state,
                // in one transaction so a failed state change leaves no record behind.
                var stateChange = MigrationPlan.SplitStateChange(record, sourceRecord);
                req = stateChange is null
                    ? new CreateRequest { Target = record }
                    : new ExecuteTransactionRequest
                    {
                        Requests = new OrganizationRequestCollection
                        {
                            new CreateRequest { Target = record },
                            new UpdateRequest { Target = stateChange }
                        }
                    };
            }

            sent.Add((sourceRecord.Id.ToString(), action));
            request.Requests.Add(req);
        }

        if (request.Requests.Count == 0) return;

        if (await target.ExecuteAsync(request, ct) is not ExecuteMultipleResponse response) return;

        foreach (var item in response.Responses)
        {
            job.Processed++;
            var (recordId, action) = item.RequestIndex < sent.Count
                ? sent[item.RequestIndex]
                : (item.RequestIndex.ToString(), RecordAction.Update);

            if (item.Fault is not null)
            {
                job.Failed++;
                job.Errors.Add(new MigrationJobError(recordId, FaultMessage(item.Fault)));
            }
            else
            {
                job.Succeeded++;
                if (action == RecordAction.Create)
                    job.Created++;
                else
                    job.Updated++;
            }
        }
    }

    private async Task DeleteMissingRecordsAsync(
        MigrationJob job,
        DataMigrationTable sourceTable,
        DataMigrationTable targetTable,
        CancellationToken ct)
    {
        var (sourceCount, missing) = await targetTable.MissingFromSourceAsync(sourceTable, job.FetchXmlFilter, ct);

        var blocked = MigrationPlan.DeleteBlockedReason(job.Options, sourceCount, missing.Count);
        if (blocked is not null)
        {
            job.Errors.Add(new MigrationJobError("N/A", blocked));
            job.Failed++;
            return;
        }

        job.Total += missing.Count;
        foreach (var chunk in missing.Chunk(BatchSize))
        {
            ct.ThrowIfCancellationRequested();

            var request = NewBatch();
            foreach (var record in chunk)
                request.Requests.Add(new DeleteRequest { Target = new EntityReference(job.EntityLogicalName, record.Id) });

            if (await target.ExecuteAsync(request, ct) is not ExecuteMultipleResponse response) continue;

            foreach (var item in response.Responses)
            {
                job.Processed++;
                if (item.Fault is not null)
                {
                    job.Failed++;
                    var recordId = item.RequestIndex < chunk.Length ? chunk[item.RequestIndex].Id.ToString() : item.RequestIndex.ToString();
                    job.Errors.Add(new MigrationJobError(recordId, FaultMessage(item.Fault)));
                }
                else
                {
                    job.Deleted++;
                }
            }
        }
    }

    private static ExecuteMultipleRequest NewBatch() => new()
    {
        Settings = new ExecuteMultipleSettings { ContinueOnError = true, ReturnResponses = true },
        Requests = new OrganizationRequestCollection()
    };

    private static string FaultMessage(OrganizationServiceFault fault) => fault.InnerFault?.Message ?? fault.Message;
}
