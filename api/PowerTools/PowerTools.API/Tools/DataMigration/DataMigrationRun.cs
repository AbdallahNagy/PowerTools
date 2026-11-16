using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using PowerTools.API.Services;

namespace PowerTools.API.Tools.DataMigration;

/// <summary>
/// Carries out one table's migration from a source to a target Dataverse connection: creates and updates
/// records, then deletes target records missing from the source when asked. Progress and errors go to its
/// <see cref="MigrationProgress"/>.
/// </summary>
public sealed class DataMigrationRun(IDataMigrationClient source, IDataMigrationClient target, ILogger? logger = null)
{
    private const int BatchSize = 100;

    /// <summary>
    /// Runs the migration to its end. It does not throw: a failure that stops the run, including cancellation,
    /// marks the progress failed with the Dataverse error, and a record Dataverse rejects is recorded and the
    /// run goes on.
    /// </summary>
    public async Task RunAsync(MigrationRequest request, MigrationProgress progress, CancellationToken ct)
    {
        progress.MarkRunning();
        try
        {
            await RunStepsAsync(request, progress, ct);
            progress.Complete();
        }
        catch (Exception ex)
        {
            progress.Fail(DataverseErrorFormatter.Format(ex));
            logger?.LogError(ex, "Migration of {Table} failed", request.EntityLogicalName);
        }
    }

    private async Task RunStepsAsync(MigrationRequest request, MigrationProgress progress, CancellationToken ct)
    {
        var sends = request.Options.Create || request.Options.Update;

        // Progress covers the records sent; deletions are added once they are known.
        if (sends)
            progress.SetTotal(await CountRecordsAsync(request, ct));

        var targetTable = await DataMigrationTable.OpenAsync(target, request.EntityLogicalName, ct);

        if (sends)
            await TransferRecordsAsync(request, progress, targetTable, ct);

        // Last, so a run that fails while reading or writing records deletes nothing.
        if (request.Options.Delete)
        {
            var sourceTable = await DataMigrationTable.OpenAsync(source, request.EntityLogicalName, ct);
            await DeleteMissingRecordsAsync(request, progress, sourceTable, targetTable, ct);
        }
    }

    // The total only drives progress, so a failed count must not stop the migration.
    private async Task<int> CountRecordsAsync(MigrationRequest request, CancellationToken ct)
    {
        try
        {
            var sourceTable = await DataMigrationTable.OpenAsync(source, request.EntityLogicalName, ct);
            return await sourceTable.CountAsync(request.FetchXmlFilter, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger?.LogWarning(ex, "Could not count {Table} records to migrate", request.EntityLogicalName);
            return 0;
        }
    }

    private async Task TransferRecordsAsync(
        MigrationRequest request,
        MigrationProgress progress,
        DataMigrationTable targetTable,
        CancellationToken ct)
    {
        var columns = MigrationPlan.SourceColumns([.. request.Attributes]);
        await foreach (var page in DataMigrationTable.PagesAsync(
            source, request.EntityLogicalName, columns, request.FetchXmlFilter, BatchSize, ct))
        {
            if (page.Count == 0) break;

            var existing = await targetTable.ExistingIdsAsync(page.Select(e => e.Id).ToList(), ct);
            await SendBatchAsync(request, progress, page, existing, ct);
        }
    }

    private async Task SendBatchAsync(
        MigrationRequest request,
        MigrationProgress progress,
        DataCollection<Entity> entities,
        HashSet<Guid> existing,
        CancellationToken ct)
    {
        var batch = NewBatch();
        var sent = new List<(string RecordId, RecordAction Action)>();

        foreach (var sourceRecord in entities)
        {
            var action = MigrationPlan.Decide(request.Options, existing.Contains(sourceRecord.Id));
            if (action == RecordAction.Skip)
            {
                progress.RecordSkipped();
                continue;
            }

            var record = new Entity(request.EntityLogicalName) { Id = sourceRecord.Id };
            foreach (var attr in request.Attributes)
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
            batch.Requests.Add(req);
        }

        if (batch.Requests.Count == 0) return;

        if (await target.ExecuteAsync(batch, ct) is not ExecuteMultipleResponse response) return;

        foreach (var item in response.Responses)
        {
            var (recordId, action) = item.RequestIndex < sent.Count
                ? sent[item.RequestIndex]
                : (item.RequestIndex.ToString(), RecordAction.Update);

            if (item.Fault is not null)
                progress.RecordRejected(recordId, FaultMessage(item.Fault));
            else
                progress.RecordSent(action);
        }
    }

    private async Task DeleteMissingRecordsAsync(
        MigrationRequest request,
        MigrationProgress progress,
        DataMigrationTable sourceTable,
        DataMigrationTable targetTable,
        CancellationToken ct)
    {
        var (sourceCount, missing) = await targetTable.MissingFromSourceAsync(sourceTable, request.FetchXmlFilter, ct);

        var blocked = MigrationPlan.DeleteBlockedReason(request.Options, sourceCount, missing.Count);
        if (blocked is not null)
        {
            progress.RecordDeleteBlocked(blocked);
            return;
        }

        progress.AddToTotal(missing.Count);
        foreach (var chunk in missing.Chunk(BatchSize))
        {
            ct.ThrowIfCancellationRequested();

            var batch = NewBatch();
            foreach (var record in chunk)
                batch.Requests.Add(new DeleteRequest { Target = new EntityReference(request.EntityLogicalName, record.Id) });

            if (await target.ExecuteAsync(batch, ct) is not ExecuteMultipleResponse response) continue;

            foreach (var item in response.Responses)
            {
                if (item.Fault is null)
                {
                    progress.RecordDeleted();
                    continue;
                }

                var recordId = item.RequestIndex < chunk.Length ? chunk[item.RequestIndex].Id.ToString() : item.RequestIndex.ToString();
                progress.RecordRejected(recordId, FaultMessage(item.Fault));
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
